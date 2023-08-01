---
title: "ERC-6551 Non-fungible Token Bound Accounts"
date: "2023/6/22"
tags: ["blockchain", "ethereum"]
---

# 目次

# ERC-721の課題
- ERC-721の規格はCryptoKittiesやNFT ArtsなどのNFTアプリケーションの爆発的な普及を可能にした。NFTはグローバルにユニークなToken IDを持つことで、オンチェーン上で特定のアカウントがあるToken IDの資産を持っていることを保証する。
![erc721](/contents/eip-6551/erc721.png)

- 最近のNFTアプリケーションではより複雑なゲームや音楽、ARとの連携などよりダイナミックでインタラクティブなものをユースケースになることが増えている。
- しかし、ERC-721ではトークンそのものがエージェントとして機能したり、他のオンチェーン資産と関連づけたりすることができないという課題がある（ERC-721ではトークン自体が他のトークンを所有することができない）
![cannot-connect-token](/contents/eip-6551/cannot-connect-token.png)

- そこでERC-721のトークンに資産を所有する機能を持たせようとする提案がいくつか存在する。（ERC-998など）
- しかし、これらの提案はそれぞれ、ERC-721の拡張を定義するものとなっている。そのため、後方互換性がなく、それ以前に発行されたトークンはその性質を利用することはできない。

# ERC-6551(Token Bound Accounts)とは
## Abstract
- この提案は全てのERC-721トークンとの後方互換性を維持しながら、全てのERC-721にEthereum Accountの全機能を付与する。（Token Bound Accounts）
- これは、各ERC-721トークンに固有の、決定論的にアドレス指定されたスマートコントラクトアカウントを、権限不要のレジストリを介して展開することで実現される。
- 各Token Bound Accountは1つのERC-721トークンによって所有され、トークンは取引履歴の記録やオンチェーン資産の所有が可能になる。
- 各Token Bound Accountの制御はERC-721の所有者に委ねられ、所有者は自分のトークンに代わって、オンチェーンでアクションを開始することができるようになる。
- これは現在Draft proposalだが既にこれを使っているプロジェクトも存在する
  - https://www.stapleverse.xyz/?ref=blog.thirdweb.com

![eip6551](/contents/eip-6551/eip6551.png)

ERC-6551を構成する主要なコンポーネントは以下の2つ
1. Token Bound Accountを実装のための標準インターフェース(Account Interface)
2. Token Bound Accountをデプロイするための許可不要のRegistry

以下の図はERC-721トークンとERC-721トークンの所有者、Token Bound AccountとRegistryの関係を示している。
![tba-registry](/contents/eip-6551/tba-registry.png)

## Account Interface
- Token Bound Accountの所有者を決めるインターフェース
- 全てのToken Bound されたアカウントはRegistry経由で作成されるべき
- 全てのToken Bound Account実装は次のインターフェースを実装する必要がある

### Interface
```
/// @dev the ERC-165 identifier for this interface is `0x400a0398`
interface IERC6551Account {
    /// @dev Token bound accounts MUST implement a `receive` function.
    ///
    /// Token bound accounts MAY perform arbitrary logic to restrict conditions
    /// under which Ether can be received.
    receive() external payable;
 
    /// @dev Executes `call` on address `to`, with value `value` and calldata
    /// `data`.
    ///
    /// MUST revert and bubble up errors if call fails.
    ///
    /// By default, token bound accounts MUST allow the owner of the ERC-721 token
    /// which owns the account to execute arbitrary calls using `executeCall`.
    ///
    /// Token bound accounts MAY implement additional authorization mechanisms
    /// which limit the ability of the ERC-721 token holder to execute calls.
    ///
    /// Token bound accounts MAY implement additional execution functions which
    /// grant execution permissions to other non-owner accounts.
    ///
    /// @return The result of the call
    function executeCall(
        address to,
        uint256 value,
        bytes calldata data
    ) external payable returns (bytes memory);
 
    /// @dev Returns identifier of the ERC-721 token which owns the
    /// account
    ///
    /// The return value of this function MUST be constant - it MUST NOT change
    /// over time.
    ///
    /// @return chainId The EIP-155 ID of the chain the ERC-721 token exists on
    /// @return tokenContract The contract address of the ERC-721 token
    /// @return tokenId The ID of the ERC-721 token
    function token()
        external
        view
        returns (
            uint256 chainId,
            address tokenContract,
            uint256 tokenId
        );
 
    /// @dev Returns the owner of the ERC-721 token which controls the account
    /// if the token exists.
    ///
    /// This is value is obtained by calling `ownerOf` on the ERC-721 contract.
    ///
    /// @return Address of the owner of the ERC-721 token which owns the account
    function owner() external view returns (address);
 
    /// @dev Returns a nonce value that is updated on every successful transaction
    ///
    /// @return The current account nonce
    function nonce() external view returns (uint256);
}
```

Account Implementation contractとtoken(), owner()の関係性は以下のようになる

![account-interface](/contents/eip-6551/account-interface.png)

### Implementation
- ERC-6551は既存のNon Fungible Tokenとの最大限の下位互換性を目指したものだが、`ownerOf`を実装していない、CryptoKitties以前のNFT コントラクトとの互換性はないことに注意が必要。

```
pragma solidity ^0.8.13;
 
import "openzeppelin-contracts/utils/introspection/IERC165.sol";
import "openzeppelin-contracts/token/ERC721/IERC721.sol";
import "openzeppelin-contracts/interfaces/IERC1271.sol";
import "openzeppelin-contracts/utils/cryptography/SignatureChecker.sol";
import "sstore2/utils/Bytecode.sol";
 
contract ExampleERC6551Account is IERC165, IERC1271, IERC6551Account {
    receive() external payable {}
 
    function executeCall(
        address to,
        uint256 value,
        bytes calldata data
    ) external payable returns (bytes memory result) {
        require(msg.sender == owner(), "Not token owner");
 
        bool success;
        (success, result) = to.call{value: value}(data);
 
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }
 
    function token()
        external
        view
        returns (
            uint256 chainId,
            address tokenContract,
            uint256 tokenId
        )
    {
        uint256 length = address(this).code.length
        return
            abi.decode(
                Bytecode.codeAt(address(this), length - 0x60, length),
                (uint256, address, uint256)
            );
    }
 
    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = this
            .token();
        if (chainId != block.chainid) return address(0);
 
        return IERC721(tokenContract).ownerOf(tokenId);
    }
 
    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return (interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC6551Account).interfaceId);
    }
 
    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4 magicValue)
    {
        bool isValid = SignatureChecker.isValidSignatureNow(
            owner(),
            hash,
            signature
        );
 
        if (isValid) {
            return IERC1271.isValidSignature.selector;
        }
 
        return "";
    }
}
```

## Registry
- RegistryはToken Bound Accountの利用を希望するプロジェクトのための単一のエントリーポイントとして機能する。Registryは2つの機能を持っている。

1. createAccount
ERC-721トークンの実装アドレスに対応したToken Bound Accountをデプロイする。
2. account
ReadOnlyの関数で実装アドレスが与えられたERC-721のToken Bound Account のアドレスを計算する。

### Interface
```
interface IERC6551Registry {
    /// @dev The registry SHALL emit the AccountCreated event upon successful account creation
    event AccountCreated(
        address account,
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt
    );
 
    /// @dev Creates a token bound account for an ERC-721 token.
    ///
    /// If account has already been created, returns the account address without calling create2.
    ///
    /// If initData is not empty and account has not yet been created, calls account with
    /// provided initData after creation.
    ///
    /// Emits AccountCreated event.
    ///
    /// @return the address of the account
    function createAccount(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt,
        bytes calldata initData
    ) external returns (address);
 
    /// @dev Returns the computed address of a token bound account
    ///
    /// @return The computed address of the account
    function account(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt
    ) external view returns (address);
}
```
- Account ImplementationとToken Bound Accountの紐付けと、生成されたToken Bound AccountとERC-721トークンの紐付けとともにToken Bound Accountを生成するのがRegistry contractの役割

![registry](/contents/eip-6551/registry.png)

### Implementation
- 実際にコントラクトを作るのに利用しているのはimplementation, chainId, tokenContract, tokenId, saltの5つ
  - chainId, tokenContract, tokenIdはToken Bound Accountを作りたいトークンごとに一意に決まる。
  - implementationは上で説明したAccount Implementationのcontract addressなので、それも決まっていれば、一意に決まる。
    - 逆に言えば、実装したAccount Implementationが変われば、Accountも別のものになる。
  - salt
    - Account Implementationが一意であれば、作成されるaddressは一意に決まるが、1つのAccount Implementationに対して、複数のToken Bound Accountを作成するためのパラメーター。
    - saltは任意に変えることができる。
- Accountを作成するのに"Create2"というオペコードを使用している。
  - これはコントラクトをデプロイする方法の1つで同じパラメーターで実行すると必ず同じcontract addressがデプロイされる（deterministic）な性質を持つ。
  - つまり、実装させたいcontract addressが決まっていれば、必ず決まったaddressが作られる。

```
pragma solidity ^0.8.13;

import "openzeppelin-contracts/utils/Create2.sol";

contract ERC6551Registry is IERC6551Registry {
    error InitializationFailed();

    function createAccount(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt,
        bytes calldata initData
    ) external returns (address) {
        bytes memory code = _creationCode(implementation, chainId, tokenContract, tokenId, salt);

        address _account = Create2.computeAddress(
            bytes32(salt),
            keccak256(code)
        );

        if (_account.code.length != 0) return _account;

        _account = Create2.deploy(0, bytes32(salt), code);

        if (initData.length != 0) {
            (bool success, ) = _account.call(initData);
            if (!success) revert InitializationFailed();
        }

        emit AccountCreated(
            _account,
            implementation,
            chainId,
            tokenContract,
            tokenId,
            salt
        );

        return _account;
    }

    function account(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt
    ) external view returns (address) {
        bytes32 bytecodeHash = keccak256(
            _creationCode(implementation, chainId, tokenContract, tokenId, salt)
        );

        return Create2.computeAddress(bytes32(salt), bytecodeHash);
    }

    function _creationCode(
        address implementation_,
        uint256 chainId_,
        address tokenContract_,
        uint256 tokenId_,
        uint256 salt_
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                hex"3d60ad80600a3d3981f3363d3d373d3d3d363d73",
                implementation_,
                hex"5af43d82803e903d91602b57fd5bf3",
                abi.encode(salt_, chainId_, tokenContract_, tokenId_)
            );
    }
}
```

# Securityに関する考察
## 1. 不正行為の防止
- Token Bound Accountの信頼できる販売を可能にするために、分散型マーケットプレイスは悪意のあるアカウント所有者による詐欺行為に対するセーフガードを実装する必要がある。

次のような詐欺の可能性を考えてみる。

1. AliceはERC-721トークンXを所有し、TBA Yを所有しています。
2. AliceはアカウントYに10ETHを入金します。
3. BobはトークンXを11ETHで購入することを分散型マーケットプレイスで提案し、アカウントYに保存されている10ETHをトークンと一緒に受け取ると仮定します。
4. AliceはTBAから10ETHを引き出し、直ちにBobの申し出を受け入れる。
5. BobはトークンXを受け取るが、アカウントYは空っぽになる。

ERC-6551では悪意のあるアカウント所有者による詐欺行為を軽減するために、分散型マーケットプレイスは、マーケットプレイスレベルでこの種の詐欺行為に対する保護を実装すべきと提案している。

以下はその方法の例

- マーケットプレイス注文に、現在のトークンバウンドアカウントのnonceを添付する。
- 注文後にアカウントの nonce が変更された場合、そのオファーは無効であるとみなす。

→ nonceが増えているということは何らかのトランザクションが実行されたことを意味するので詐欺を防止できる。

他には

- マーケットプレイス注文に、注文が成立したときにトークンバウンドアカウントに残ると予想される資産のコミットメントのリストを添付する。
- 注文後にコミットメントされた資産のいずれかがアカウントから削除された場合、そのオファーは無効であるとみなす。

などの機能をマーケットプレイスレベルでサポートする必要がある。

他にもトークンバウンドアカウントの実装にロック機能を実装し、悪意のある所有者がロック中にアカウントから資産を引き出すことを防止するなどの方法もある。

しかし、いずれにしても不正行為を防止することについては、このProposalでは提案の範囲外となっているので、ERC-6551を採用する場合は何らかの対策を講じる必要がある。

## 2. 所有権のサイクル
- トークンバウンドアカウントに保有されているすべての資産は、所有権サイクルが作成されるとアクセスできなくなる可能性がある。
- 最も単純な例としては、ERC-721トークンが自分のトークンバウンドアカウントに転送されるケース。
  - この場合、トークンバウンドアカウントはERC-721トークンを転送するトランザクションを実行できないため、ERC-721トークンとトークンバウンドアカウントに保存されているすべての資産の両方に永久的にアクセスできなくなる。（トークンバウンドアカウントはアセットを転送する能力がないため、トークンの所有者がトークンバウンドアカウントになった場合永久にアセットを送ることができなくなる）
- 従って、ERC-6551を採用する場合は所有権サイクルの可能性を制限する手段を実装することが推奨される。

# 感想
- 721の拡張版としてNFTの問題点を解決するのではなく、互換性を持たせたままNFTの使い方を広げる面白い提案
- Solidity assemblyをそろそろ真面目に勉強しないとなぁ

# Reference
- https://eips.ethereum.org/EIPS/eip-6551
- https://docs.openzeppelin.com/cli/2.8/deploying-with-create2