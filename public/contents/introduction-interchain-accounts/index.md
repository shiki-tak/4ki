---
title: "Interchain Accountsについて調べてみた"
date: "2022/02/05"
tags: ["blockchain", "interchain", "cosmos"]
---

# 目次

年末に出た What’s Coming to Cosmos in 2022? で気になった技術の1つInterchain Accountsについて調べてみました。

Interchain Accountsは一言で言うと「IBCを用いてブロックチェーンのアカウントが他のブロックチェーンのアカウントを安全にコントロールすることを可能にする機能」でIBCのspec、ics27で議論されています。

# IBCの問題点
cosmos-sdkに標準で備わっているモジュール（bankやgovなど）はどのブロックチェーン でも共通なので、IBCで相互接続が簡単に可能ですが、アプリケーション固有の機能はチェーンが個別にIBCの対応を行わなければいけません。そのため、

- 開発コストが増える
- チェーンによって対応のタイミングがバラバラ
などの問題が発生します。

この問題に対応する機能がInterchain Accountsで、具体的には以下のようなことを行っています。

- すべてのモジュールの機能に対してアプリケーションレベルのIBCを作成することなく、ブロックチェーンのアプリケーション固有の機能にアクセスできるようにする
- IBC自体はチェーン間のデータ制御（転送、認証、順序づけなど）のプロトコルとして汎用化されていて、チェーン上のアプリ固有の制御部分はInterchain accountsがまかなう
- Interchain accountsのモジュールがIBCから受け取ったトランザクションをIBCを利用したトランザクションではなく、IBCを利用していない"普通のトランザクション"のふりをさせて、必要なモジュールに渡す
  - この"普通のトランザクション"のふりをさせる部分に、トランザクションを送った元のチェーンのアカウントのみが制御できるInterchain accountを利用する

# 機能
機能はシンプルに大きく分けて2つあります。

IBCを介して新しいInterchain accountを決定論的に作成する
トランザクションをInterchain accountに中継し、ターゲットとなるブロックチェーンに送信する

# 定義
- Host Chain
  - Interchain accountが登録されているチェーン。Interchain accountが実行する命令（cosmos-sdkのmsgなど）を含むController ChainからIBCパケットをlistenする
- Controller Chain
  - Host Chain上のInterchain accountを登録および制御するチェーン
  - Controller Chainはアカウントを制御するためにIBC パケットをHost Chainに送信する
- Interchain Account
  - Host Chain上のアカウント
  - Controller Chainは秘密鍵を使用してトランザクションに署名するのではなく、IBC パケットをHost Chainに送信する。Host ChainはInterchain accountsが実行する必要のあるトランザクションを通知する
- Interchain Account Owner
  - Controller Chain上のアカウント
  - Host Chain上の全てのInterchain accountにはController Chain上にそれぞれの所有アカウントがある

# ちょっとだけ詳細
Interchain Accountとtx実行時に何をしているのかを見るために少しコードを覗いてみました。

## Register account
- InitInterchainAccount関数がInterchain accountを登録するためのエントリポイント
- Owner address(Host Chain上の自身のアカウント)を使用して新しいportIDを生成する
- portID = PortPrefix + Owner Address
これはChannelOpenInit イベントを発行し、 Relayerがこれを拾う。アカウントは、Host ChainのOnChanOpenTryステップで登録される

```text
// In Controller Chain
function InitInterchainAccount(connectionId: string, owner: string) returns (error) { 
}
```
- OnChanOpenTry内でInterchain accountを生成し登録する
- Interchain accountはportIDを利用したModule Addressのサブアドレス。よって、これ自体ではトランザクションに署名できず、モジュールによって内部的に管理される。

```go
// Host Chain
func (k Keeper) OnChanOpenTry(
    ctx sdk.Context,
    order channeltypes.Order,
    connectionHops []string,
    portID,
    channelID string,
    chanCap *capabilitytypes.Capability,
    counterparty channeltypes.Counterparty,
    counterpartyVersion string,
) (string, error) {
 
    accAddress := icatypes.GenerateAddress(k.accountKeeper.GetModuleAddress(icatypes.ModuleName), counterparty.PortId)
    k.RegisterInterchainAccount(ctx, accAddress, counterparty.PortId)
 
}
```

## Execute Tx
- Controller Chainからmsgを受け取ると、msgを実行する前にAuthenticateTxが呼び出される。
```go
// Host Chain
func (k Keeper) executeTx(ctx sdk.Context, sourcePort, destPort, destChannel string, msgs []sdk.Msg) error {
    if err := k.AuthenticateTx(ctx, msgs, sourcePort); err != nil {
        return err
    }
  // validate each message
  // verify that interchain account owner is authorized to send each message
  // execute each message
}
```
- AuthenticateTx は、msgのsignerが、IBC パケットが送信されたチャネルの相手側 portID に関連付けられたInterchain accountであることをチェックする。
```go
function AuthenticateTx(msgs []Any, portId string) error {
    // GetInterchainAccountAddress(portId)
    // interchainAccountAddress != signer.String() return error
}
```

IBCのためのChannelを開くためのportIDに元のアドレスを使っていてそれを元に1対1でInterchain Accountを生成するので、元のチェーンで正しく署名したことを担保として、Interchain Accountでトランザクションが実行できるという理屈のようでした。

# Interchain Accountsを使うと...
これを各チェーンが実装すれば、副次的にこんないいことがあるなと思ったことを挙げてみました。

- チェーン同士が繋がった世界でチェーン別にアカウント(private key)を持つ必要がなくなる
- スマートコントラクトがEVMで相互に作用するのと同じようにCosmosのアプリケーションが簡単に相互作用可能になる
- IBCによる相互接続のスピードが上げる
- IBCで相互接続するのはいいけど、チェーンごとにアカウントを管理しなければいけない状況はユーザーにとっては不幸だよなーと思っていたので、これを使えばどこかのチェーンでアカウントを持っていればいいので、ブロックチェーン上のアプリを使う上でのUXも向上するのでは？と思いました。

interchain accountsを使ったデモもすでに実装されていたので、試してみましたがちゃんと動いたので、試したい方はこちらから↓
https://github.com/cosmos/interchain-accounts-demo
