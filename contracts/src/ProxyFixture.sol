// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Proxy-resolution fixture only. This is not presented as a pool-compatible hook.
contract ProxyFixture {
    bytes32 private constant IMPL = bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
    bytes32 private constant ADMIN = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);

    constructor(address implementation) {
        bytes32 i = IMPL;
        bytes32 a = ADMIN;
        assembly {
            sstore(i, implementation)
            sstore(a, caller())
        }
    }

    function upgradeTo(address implementation) external {
        bytes32 i = IMPL;
        bytes32 a = ADMIN;
        address admin;
        assembly { admin := sload(a) }
        require(msg.sender == admin, "only admin");
        require(implementation.code.length > 0, "no code");
        assembly { sstore(i, implementation) }
    }

    fallback() external {
        bytes32 i = IMPL;
        assembly {
            let target := sload(i)
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

contract RevisionOne {
    function revision() external pure returns (uint256) {
        return 1;
    }
}

contract RevisionTwo {
    function revision() external pure returns (uint256) {
        return 2;
    }
}
