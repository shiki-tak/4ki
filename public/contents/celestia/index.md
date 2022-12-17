---
title: "Celestia"
date: "2022/12/12"
tags: ["blockchain", "cosmos"]
---

# 目次

# Modular Blockchain
Modular Blockchainとは、Blockchainにおける、

1. データの検証・保存（Data Availability）
2. 合意形成（Consensus）
3. トランザクションの実行（Execution）
4. 実行結果の確定とDisputeの解決（Settlement）

といったコア機能を分離し、各機能を役割分担させて組み合わせることを前提にした設計思想や、そういった役割をもったBlockchainのことを指します。一方で、BitcoinやEthereumのようなL1チェーンはMonolithic Blockchainと呼ばれます。Monolithic Blockchainの課題としては、大きなブロックサイズが必要な仕様の場合高スループットを実現するためにノードのハードウェア要件が高まってしまいバリデータへの参入障壁によって分散性が十分になされないといったことや、データの有効性の検証のためにトランザクションを再実行が必要になる場合があり、処理速度の遅延につながることがあげられます。

Modular Blockchainが注目される背景には、レイヤー2などのスケーリングソリューションが展開されているもののトランザクションの実行コストの低下が十分ではないことが言われています。また、こうした事情からデータの保存・検証を信頼できるグループが担う方式（Data Availability Commitee：DAC）を導入しようとする動きがあります。たとえば、Ethereumのレイヤー2であるArbitrum Novaでは、データの保存・検証を信頼できる委員会（Committee）を組織して行うことを想定しています。
しかし、DACが障害点になるという懸念事項があり、これに対してModular Blockchainを活用することで検証するデータ量の削減などにより検証コストを低下させながら障害点を作らずセキュリティを維持するような仕組みを構築することが可能といわれ、Blockchainのトリレンマへアプローチします。
レイヤー2によってスケーラビリティの問題の解決が図られていますが、分散性を維持しようとするのであれば、より一層柔軟な実行環境が求められます。そうした需要に応えるためModular Blockchainが注目されているといえます。

![ethereum-centric](/contents/celestia/ethereum-centric.png)

- deep dive into Modular Blockchain
  - https://volt.capital/blog/modular-blockchains

# Celestia Overview
CelestiaはModular Blockchainの実現を目指しているプロジェクトであり、Data Availability Layerを提供するためのチェーンです。データの検証・保存とコンセンサスという機能に限定されており、トランザクションを実行するレイヤーとは分離されています。Celestiaからデータが保存されていることの証明をコントラクトに提供する事によって、ノードがダウンロードするデータを削減することができ、チェーンの実行処理速度のコストが可能です。Cosmos SDKやTendermintを使用しています。

- RollupにおいてL1で行われていたfraud proof or validity proofとtransaction dataの保存（DAの提供）のうち、DAの提供のみを引き受ける独立したL1チェーン
- CelestiaとしてはData Availability Layerの提供が目的であり、ExecutionやSettlement Layerは自分で用意してくださいという考え方、ただしConsensus Layerも提供しているようなのでMonolithicな使い方も可能
- Cosmos-SDKをベースとしたOptimistic Rollupの実装としてrollmintというアプリケーションも開発されているがCelestiaを語る上で必須のものではない様子、あくまでもCelestiaの目的はDA Layerの提供
  - https://github.com/celestiaorg/rollmint 
  - Data Availability LayerとしてCelestiaを使い、Execution Layerを提供するFuelというプロジェクトなどがある。
    - https://fuellabs.github.io/fuel-docs/master/why-fuel.html

# Data Availability Sampling
悪意のあるBlock producerは、 𝑑𝑎𝑡𝑎𝑅𝑜𝑜𝑡𝑖 の再計算に必要なデータを保留し、Block headerのみをネットワークにリリースすることで、フルノードがfraud proofを生成するのを防ぐことができます。
Block producerは、ブロックが公開されてからかなり時間がたってからデータ (無効なトランザクションや状態遷移が含まれている可能性がある) を解放し、ブロックを無効にすることができます。
これにより、将来のブロックの台帳でトランザクションのロールバックが発生します。したがって、light clientには、 𝑑𝑎𝑡𝑎𝑅𝑜𝑜𝑡𝑖 に一致するデータが実際にネットワークで利用可能であることを保証するレベルが必要です。 Reed-Solomon Erasure Coding に基づくData Availability Samplingを提案します。light clientはランダムなデータshareを要求して、Merkle treeのrootに関連付けられたすべてのデータが使用可能であることを高い確率で保証します。
スキームは、light clientがこれらのshareをフル ノードにアップロードするため、ネットワークがデータを回復できるように、同じ要求を行う十分な数の正直なlight clientがあることを前提としています。

## 1. 2D Reed-Solomon Encoded Merkle Tree Construction
1. 生データをそれぞれshareSizeのサイズのシェアに分割し、それらを $k × k$ 行列に配置する
  - シェア：namespaceIDに関連付けられた固定サイズのデータチャンク

|  name  |  type  |  Description  |
|  ----  |  ----  | ------------- | 
|  namespaceID  |  byte[NAMESPACE_ID_BYTES]  |  シェアのnamespaceID  |
|  rawData  |  byte[SHARE_SIZE]  |  生のtxデータ  |

2. $ k × k $ 行列の各行と列にReed-Solomon Codingを適用してデータを水平方向と垂直方向に拡張する。行列の垂直方向に拡張された部分をさらに拡張することで $ 2k × 2k $　行列であるブロック $i$ の拡張行列 $M_i$ を得る。
3. $ 2k × 2k $ 行列の各行と各列に対してMerkle rootを計算する。$rowRoot^j_i = root((M^{j,1}_i, M^{j,2}_i, ..., M^{j,2k}_i))$ と $columnRoot^j_i = root((M^{1,j}_i, M^{2, j}_i, ..., M^{2k, j}_i))$を得る。ここで$M^{x, y}_i$を得る。
4. ステップ3で計算されたrootのMerkle rootを計算し、これを $dataRoot_i$として使用する。ここで、$dataRoot_i = root((rowRoot^1_i, rowRoot^2_i, ..., rowRoot^{2k}_i, columnRoot^1_i, columnRoot^2_i, ..., columnRoot^{2k}_i))$となる。

![reed-solomon-encoding](/contents/celestia/reed-solomon-encoding.png)

- Reed-Solomon Coding
  - https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction
  - https://ja.wikipedia.org/wiki/%E3%83%AA%E3%83%BC%E3%83%89%E3%83%BB%E3%82%BD%E3%83%AD%E3%83%A2%E3%83%B3%E7%AC%A6%E5%8F%B7

## 2. Random Sampling and Network Block Recovery
2次元リードソロモン行列の任意のシェアが復元不可能であるためには、 $(2k)^2$ 個のシェアのうち、少なくとも $(k + 1)^2$ のシェアが復元不可能でなければならない。したがって、light clientがネットワークから新しいBlock headerを受信したとき、拡張行列から$0 < s < (k + 1)^2$ 個の異なるシェアをランダムにサンプリングし、全てのシェアを受信した場合にのみBlockを受け入れる必要がある。さらにlight clientは受け取ったシェアをネットワークにgossipし、フルノードがブロック全体を復元できるようにする。light clientとそれが接続されているフルノードとの間のプロトコルは、以下のように動作する。

1. light clientは接続先のフルノードの1つから新しいBlock header $h_i$ を受信し、各行と各列のrootsのセット $R = (rowRoot^1_i, rowRoot^2_i, ..., rowRoot^{2k}_i, columnRoot^1_i, columnRoot^2_i, ..., columnRoot^{2k}_i)$ を受け取る。もし、 $root(R) = dataRoot_i$ がfalseの場合、light clientはheaderをrejectする。
2. light clientは一意の$(x, y)$ 座標のセット $S = \{(x_0, y_0), (x_1, y_1), ... (x_n, y_n)\}$をランダムに選択する。ここで$0 < x \leq matrixWidth_i$, $0 < y \leq matrixWidth_i$ とし、拡張行列上の点に相当する点を接続されている1つ以上のフルノードに送る。
3. フルノードが$S$ の座標に対応する全てのシェアとそれらに関連付けられたMerkle proofを持っている場合、各座標$(x_a, y_b)$ に対して、フルノードは $M^{x_a, y_b}_i, \{M^{x_a, y_b}_i, → rowRoot^a_i\} or M^{x_a, y_b}_i, \{M^{x_a, y_b}_i, → columnRoot^b_i\}$ で応答する。各シェアに対して2つのMerkle proofの可能性があることに注意する。列 rootからのものと行 rootからのものであり、したがって、フルノードは列もしくは行に関連付けられている場合、各Merkle proofに対しても指定する必要があります。
4. light clientが受け取った各シェア$M^{x_a, y_b}_i$ に対して、light clientはproofが行 rootからのものである場合、$VerifyMerkleProof(M^{x_a, y_b}_i, \{M^{x_a, y_b}_i → rowRoot^a_i\}, rowRoot^a_i, matrixWidth_i, b)$ がtrueになることを確認し、proofが列 rootからのものである場合、$VerifyMerkleProof(M^{x_a, y_b}_i, \{M^{x_a, y_b}_i → columnRoot^b_i\}, columnRoot^b_i, matrixWidth_i, a)$ がtrueになることを確認する。
5. ステップ4のすべての証明が成功し、ステップ2で作成されたサンプルからシェアが欠落していない場合、時間内にBlockのErasure CodeのFraud proofが受信されなければ、ブロックは使用可能として受け入れられる。

## 3. Fraud Proofs of Incorrectly Generated Extended Data
フルノードが特定の列または行を復元するのに十分なシェアを持ち、復元後に復元されたデータがそれぞれの列または行のルートと一致しないことを検出した場合、その列または行の十分なシェアからなるfraud proofを配布しなければならない。

fraud proofの検証を行う関数 $VerifyCodecFraudProof$ を定義する。

VerifyCodecFraudProofの概要。不正の証明は、以下のものから構成されます。
不正に生成された列または行のMerkle root、そのrootがデータツリーにあることのMerkle proof、その列または行を再構築できる十分なシェア そして，各シェアがデータツリー内にあることを証明するMerkle proofである．この関数は、不正行為の証明を入力とし、(i)証明者が与えたすべてのシェアが、同じ列または行にあること， (ii) 回復された列または行が，列または行のrootがBlock内の列または行のrootと一致しないことを確認する。もし両方の条件が真であれば
不正の証明は有効であり、不正の証明の対象となったBlockはclientによって拒否される。

Source code
- BadEncodingProof
  - https://github.com/celestiaorg/celestia-node/blob/main/share/eds/byzantine/bad_encoding.go#L107
- ExtendedHeader
  - https://github.com/celestiaorg/celestia-node/blob/21bb00c0cb71cc2568c1a0ed5162eae0775c90c6/header/header.go#L38
- DataAvailabilityHeader
  - https://github.com/celestiaorg/celestia-app/blob/main/pkg/da/data_availability_header.go#L28

## Samplingのセキュリティ仮定
具体的な証明方法は原論文(https://arxiv.org/pdf/1809.09044.pdf)を参照してください。

### 1. 復元不可能な最小の使用可能なシェア
悪意のあるBlock proposerが少なくとも $k + 1$ 個の列または $k + 1$ 個の行のシェアを留めた場合、データは回復できない。これにより、合計 $(k + 1)^2$ のシェアが留められる。図に示すように $2k × 2k$ 行列 $E$ が与えられた場合、少なくとも $k + 1$ 列または $k + 1$ 行にそれぞれ少なくとも $k + 1$ 個の利用できないシェアがある場合、データは回復できない。その場合、回復不能でなければならないシェアの最小数は $(k + 1)^2$ となる。

![data-unrecoverable](/contents/celestia/data-unrecoverable.png)

### 2. 回復不能ブロックの検出
単一のlight clientが行列内の少なくとも1つの使用不可のシェアを、回復不能の最小使用不可のシェアでsamplingし、ブロックが回復可能であることを検出する確率を述べる。

上の図に示すように $2k × 2k$ 行列 $E$ が与えられ、$(k + 1)^2$ 個のシェアは利用できないとする。単一のlight clientが $E$ からランダムに $0 < s < (k + 1)^2$ のシェアをsamplingした場合、少なくとも1つの利用できないシェアをsamplingする確率は以下のようになる。

$$
p_1(X \geq 1) = 1 - \prod_{i = 0}^{s - 1}\left(1- \frac{(k + 1)^2}{4k^2 - i}\right)
$$

以下の図はこの確率が $k=32$ および $k=256$ に対して、 のサンプルでどのように変化するかを示している。各light clientは、3回のsampling後、約 60% の確率で少なくとも 1 つの利用できないシェアをサンプリングする。 15 回のsampling後に 99% の確率となる。

![sampling-probability](/contents/celestia/sampling-probability.png)

### まとめ

Celestiaは、与えられたブロックサイズに対して、Data Availability Samplingを行っているlight clientの最小数が存在すると仮定しています。この仮定は、light clientがSamplingして保存したデータの部分から、フルノードがブロック全体を再構築できるようにするために必要です。必要なlight clientの量はブロックサイズに依存し、より大きなブロックではより多くのlight clientが実行されていると想定されます。

Data Availability Samplingにおいて重要な仮定は、少なくとも1つの正直なフルノードに接続されていることです。これにより、light clientは不正にErasure codingされたブロックに対するFraud proofを受け取ることができます。light clientが正直なフルノードに接続されていない場合、例えばeclipse attackの際、ブロックが不適切に構築されていることを検証することができません。

Celestiaでは、Data Availability Samplingのプロセスを支援するために、冗長なデータが存在するようにブロックをErasure codingする必要があります。しかし、データのerasureを担当するノードが誤ってErasure codingを行う可能性があります。CelestiaはErasure codingが正しくないことを検証するために不正証明書を使用するので、不正エンコーディングの不正証明書を生成するためには全ブロックのデータが必要である。

バリデータはlight clinetにのみデータを提供し、フルノードには提供しないという状況があり得る。もしフルノードがlight clientが保存したデータの一部からフルブロックを再構築する能力を持たなければ、不正なエンコーディングの不正証明を生成することはできない。

# Namespaced Merkle Trees
Celestiaは、ブロックデータを複数の名前空間に分割し、DAレイヤーを使用するアプリケーション（ロールアップなど）ごとに1つの名前空間を使用します。その結果、各アプリケーションは自分のデータのみをダウンロードする必要があり、他のアプリケーションのデータは無視することができる。これが機能するためには、DA Layerは提供されたデータが完全であること、すなわち与えられたnamespaceのすべてのデータが返されることを証明できなければならない。このため、CelestiaはNMT（Namespaced Merkle Trees）を使用している。

NMTは、leafを名前空間識別子で並べたMerkle treeで、木のすべてのノードがそのすべての子孫の名前空間の範囲を含むようにハッシュ関数が変更されている。次の図は、高さ3（つまり8つのデータチャンク）のNMTの例である。データは3つのnamespaceに分割される。

![nmt](/contents/celestia/nmt.png)
https://docs.celestia.org/concepts/how-celestia-works/data-availability-layer/

アプリケーションがnamespace 2のデータを要求するとき、DA LayerはデータチャンクD3、D4、D5、D6とノードN2、N8、N7を証明として提供しなければならない（アプリケーションはブロックヘッダからすでにルートN14を持っていることに注意すること）。その結果、提供されたデータがブロックデータの一部であることを確認することができる。さらに、アプリケーションは、namespace 2に対するすべてのデータが提供されたことを確認することができる。DA Layerが例えばデータチャンクD4及びD5のみを提供する場合、DA Layerは、証明としてノードN12及びN11も提供しなければならない。しかし、アプリケーションは、2つのノードの名前空間範囲、すなわち、N12とN11の両方がnamespace 2の一部である子孫を持つことをチェックすることによって、データが不完全であることを識別することができる。

# Elements
- celestia-core(https://github.com/celestiaorg/celestia-core)
  - Tendermintをforkして開発している
  - Block dataのerasure coding(using the 2-dimensional Reed-Solomon encoding scheme)を有効にする
  - Tendermintがblock dataを格納するために使用する通常のMerkle treeをExecutionとSettlement Layerが必要なデータのみをダウンロードできるようにするNamespaced Merkle Treeに置き換える
- celestia-app(https://github.com/celestiaorg/celestia-app)
  - data availability layerを実装したL1のチェーン
  - Celestia Coreの上に構築されているアプリケーション
  - use https://github.com/celestiaorg/rsmt2d
    - Go implementation of two dimensional Reed-Solomon Merkle tree data availability scheme.
- celestia-node(https://github.com/celestiaorg/celestia-node)
  - 実際に稼働しているノード

# まとめ・所感
従来のスケーラビリティ向上のためのRollupはその検証方法によらずData AvailabilityをL2で発生したデータを全てL1で保存することで担保していた。しかし、これだけでは一時凌ぎ的なソリューションである。この場合、Data Availabilityを検証する場合、全ブロックをダウンロードする必要があります。そのため、スループットを向上させるためにブロックサイズを大きくすると、フルノードのハードウェア要件が増加し、ブロック生成が一部のノードによってのみ実行される中央集権的になります。そこで、ブロック生成と検証を分離するためにData Availability Layerを導入するというアイディアが登場しました。実行と検証を他のModularに任せ、トランザクションの順序付けのためのData Availability Layerと、Data Availability Samplingによるデータ可用性保証にのみ焦点を当てています。集中型のブロック生成と分散型のブロック検証が、Celestiaの設計思想です。

### ZK proofが全てを解決するか？
ZK proofを使用するZK Rollupが主流になればData Availability Layerは不要になるのでしょうか？ZK RollupはOptimistic Rollupと似ているが、不正なブロックを検出するためにFraud proofを用いるのではなく、ブロックが有効であることを証明するためにValidity proofと呼ばれる暗号的証明を用いる。Validity proof自体はData Availabilityを必要としない。しかし、Block producerが有効なブロックを作成し、Validity proofでそれを証明するが、ブロックのデータをリリースしない場合、ユーザーはブロックチェーンの状態を知ることができないため、ZK rollup全体では依然としてData Availabilityが必要です。つまり、結局、L2でExecution LayerでどのようなRollupを用意しようともそこで発生したデータをどこに保存しておくのかという問題は以前として残っており、Data Availability Layerに保存しておくという手段は残されていることになります。

# Reference
https://arxiv.org/pdf/1809.09044.pdf
https://docs.celestia.org
https://medium.com/imperator-guide/modular-vs-monolithic-blockchains-introduction-to-celestia-the-first-modular-blockchain-d99d6899cfe1
