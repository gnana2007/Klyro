// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Test} from "forge-std/Test.sol";
import {LocalScenario, ObservedFeeHook} from "../src/LocalScenario.sol";

contract SimulationTest is Test {
    function testBaselineVersusHookReturnDelta() public {
        LocalScenario s = new LocalScenario();
        bytes memory init = abi.encodePacked(type(ObservedFeeHook).creationCode, abi.encode(s.manager()));
        bytes32 salt;
        address predicted;
        for (uint256 i = 0;; i++) {
            salt = bytes32(i);
            predicted =
                address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(s), salt, keccak256(init))))));
            if (uint160(predicted) & 16383 == 196) break;
        }
        s.installHook(salt);
        assertEq(address(s.hook()), predicted);
        s.prepare();
        uint256 baseline = s.execute(false);
        uint256 hooked = s.execute(true);
        ObservedFeeHook h = s.hook();
        assertGt(baseline, hooked);
        assertEq(baseline - hooked, h.totalFee());
        assertEq(h.beforeCalls(), 1);
        assertEq(h.afterCalls(), 1);
        emit log_named_uint("baselineOutput", baseline);
        emit log_named_uint("hookOutput", hooked);
        emit log_named_uint("observedReturnDeltaFee", h.totalFee());
    }
}
