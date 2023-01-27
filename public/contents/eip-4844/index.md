---
title: "EIP-4844 Proto-danksharding"
date: "2023/01/26"
tags: ["blockchain", "ethereum"]
---

# 目次

# 動機
RollupでL2からL1へ送られるトランザクションはcalldataに保存されるが、L2でのトランザクション量が増えるとcalldataに保存するガスコストが高騰し、Rollupの実行コストが高騰するという問題を解決したい。

# 概要
calldataは変数が格納されるデータ領域。スマートコントラクト内の変更不可、非永続的な領域でブロック内のログとして履歴が残るデータ領域。

したがって、そもそもたくさんのトランザクションデータを保存しておくために設計されたデータ領域ではない。Stateなど別のデータ領域よりは安いからという理由でL2のトランザクションを保存しておく場所として使われ始めた。

calldata は、Ethereumが最初に設計されたときのスマート コントラクト関数呼び出しのパラメーターにすぎず、すべてのノードが同期的にダウンロードする必要があるデータ。calldata が拡大すると、Ethereum networkに高負荷がかかるため、calldata のコストは比較的高くなる。これが、現在 L2 料金が高くなる主な要因。

L2 から渡されたデータ用に別のデータ型を設計し、それを L1 の calldata から分離する。このタイプのデータは、特定の期間内にそれを必要とする他の人がアクセスしてダウンロードできるようにするだけでよくなる。

Blobという新しいトランザクションタイプを定義するのがEIP-4844

BlobはBinary Large Object の略語

Blob は、calldata のようにメイン チェーンに直接アップロードされるのではなく、Consensus Layerのノードによって保存される。

Blobの特徴は以下の2つ。

- calldata のように EVM で読み取ることはできない
- 有効期間があり、30 日後に削除される
2023年3Q中に実装予定

Consensus LayerとExecution Layerが分離されたチェーンであることが前提

# 詳細
## Blob transactioinの流れ
![blob-transaction](/contents/eip-4844/blob-transaction.png)

1. L2 Sequencer がトランザクションを決定し、トランザクション結果と関連するプルーフ (黄色の部分) とデータ パケット (Blob、青色の部分) を L1 のトランザクション プールに送信する
2. L1 ノード (Beacon Proposer) はトランザクションを見て、新しいブロックの提案 (Beacon Block) で関連するトランザクションを実行してブロードキャストするが、ブロードキャストするときは Blob を分離してConsensus Layerに残す。Execution Layerの新しいブロックに入れる
3. 他の L1 ノードは、新しいブロックの提案とトランザクションの結果を受け取る。L2のValidatorになる必要がある場合は、Blobs Sidecar に移動して関連データをダウンロードする。


## Transaction type
```
class SignedBlobTransaction(Container):
    message: BlobTransaction
    signature: ECDSASignature
 
class BlobTransaction(Container):
    chain_id: uint256
    nonce: uint64
    max_priority_fee_per_gas: uint256
    max_fee_per_gas: uint256
    gas: uint64
    to: Union[None, Address] # Address = Bytes20
    value: uint256
    data: ByteList[MAX_CALLDATA_SIZE]
    access_list: List[AccessTuple, MAX_ACCESS_LIST_SIZE]
    max_fee_per_data_gas: uint256
    blob_versioned_hashes: List[VersionedHash, MAX_VERSIONED_HASHES_LIST_SIZE]
 
class AccessTuple(Container):
    address: Address # Bytes20
    storage_keys: List[Hash, MAX_ACCESS_LIST_STORAGE_KEYS]
 
class ECDSASignature(Container):
    y_parity: boolean
    r: uint256
    s: uint256
```
- BlobTransactionのmax_fee_per_data_gasとblob_versioned_hashesがEIP-4844によって新しく追加されたフィールド

## Beacon chainの検証
Consensus Layerでは、beacon block本体でblobが参照されるが、完全にはエンコードされない。コンテンツ全体をblock埋め込む代わりに、blobのコンテンツがsidecarとして個別に伝播される。

is_data_available()でsidecarを検証したのちに受け入れる。https://github.com/ethereum/consensus-specs/blob/23d3aeebba3b5da0df4bd25108461b442199f406/specs/eip4844/beacon-chain.md#is_data_available

完全なシャーディングが実装されるとDAS(Data Availability Sampling)に置き換わるのでDAの検証にすべてのBlobをダウンロードする必要がなくなる

## Point evaluation precompile
- POINT_EVALUATION_PRECOMPILE_ADDRESS でprecompile contractを追加し、（commitmentで表される）Blobが与えられたポイントで与えられた値に評価されることを主張する KZG proofを検証する。

```
def point_evaluation_precompile(input: Bytes) -> Bytes:
    """
    Verify p(z) = y given commitment that corresponds to the polynomial p(x) and a KZG proof.
    Also verify that the provided commitment matches the provided versioned_hash.
    """
    # The data is encoded as follows: versioned_hash | z | y | commitment | proof |
    versioned_hash = input[:32]
    z = input[32:64]
    y = input[64:96]
    commitment = input[96:144]
    kzg_proof = input[144:192]
 
    # Verify commitment matches versioned_hash
    assert kzg_to_versioned_hash(commitment) == versioned_hash
 
    # Verify KZG proof
    assert verify_kzg_proof(commitment, z, y, kzg_proof)
 
    # Return FIELD_ELEMENTS_PER_BLOB and BLS_MODULUS as padded 32 byte big endian values
    return Bytes(U256(FIELD_ELEMENTS_PER_BLOB).to_be_bytes32() + U256(BLS_MODULUS).to_be_bytes32())
```

## Networking
- tx: Execution Layerに渡されるPayload
- blob_kzgs, blobs, kzg_aggregated_proof: sidecarとしてConsensus Layerが保存するデータ

```
class BlobTransactionNetworkWrapper(Container):
    tx: SignedBlobTransaction
    # KZGCommitment = Bytes48
    blob_kzgs: List[KZGCommitment, MAX_TX_WRAP_KZG_COMMITMENTS]
    # BLSFieldElement = uint256
    blobs: List[Vector[BLSFieldElement, FIELD_ELEMENTS_PER_BLOB], LIMIT_BLOBS_PER_TX]
    # KZGProof = Bytes48
    kzg_aggregated_proof: KZGProof
```
別のBeacon ノードがBlobTxを受け取ると以下のような検証をして受け取る

```
def validate_blob_transaction_wrapper(wrapper: BlobTransactionNetworkWrapper):
    versioned_hashes = wrapper.tx.message.blob_versioned_hashes
    commitments = wrapper.blob_kzgs
    blobs = wrapper.blobs
    # note: assert blobs are not malformatted
    assert len(versioned_hashes) == len(commitments) == len(blobs)
 
    # Verify that commitments match the blobs by checking the KZG proof
    assert verify_aggregate_kzg_proof(blobs, commitments, wrapper.kzg_aggregated_proof)
 
    # Now that all commitments have been verified, check that versioned_hashes matches the commitments
    for versioned_hash, commitment in zip(versioned_hashes, commitments):
        assert versioned_hash == kzg_to_versioned_hash(commitment)
```
# まとめと所感
- EIP 4844はcalldataに保存していたL2のトランザクションデータをConsensus Layerに保存する新しいトランザクションタイプの提案
- そのため、BlobはExecution Layerで実行されることはない
- 保存期間が決まっているため、期限を超えたデータは削除することができる → ノードの容量を削減できるのでコストも下がる
- Blobはdankshardingとの互換性を持たせるため、KZG commitmentという手法が導入される予定
- calldataを使わずにBlobを導入することでどれくらいガス代が抑えられるのかを理解するには、Blobにはこれまでのガス代と異なる手数料体系が提案されているのでそちらの理解が必要（EIP-1559の理解が必要）
- RollupにはORUとZKRがあるが、ORUはL1への書き込みコストはほぼデータ保存コストのみなのに対して、ZKRはvalidity proofの検証コストもかかり、これはEIP-4844でコスト削減の対象とならないので、どちらかというとORUの方が恩恵がありそう？な提案
- ZKRでガスコストを削減する方法はIntmaxやstarknetなど個別のRollupを調べた方が良さそう
- KZG commitmentの話がここでも出てきたのでそろそろこれに関しても理解しておいた方が良さそう
