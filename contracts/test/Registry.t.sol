// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Test} from "forge-std/Test.sol";
import {HookRiskRegistry} from "../src/HookRiskRegistry.sol";

contract RegistryTest is Test {
    HookRiskRegistry r;
    address hook = address(0x1234);
    bytes32 fingerprint = keccak256("state");
    bytes32 report = keccak256("report");

    function setUp() public {
        r = new HookRiskRegistry(address(this));
    }

    function testPublicationAndVersionUpdate() public {
        r.publish(hook, 1, fingerprint, report, 1);
        assertEq(r.latest(keccak256(abi.encode(uint256(1), hook))), report);
        bytes32 newer = keccak256("new report");
        r.publish(hook, 1, fingerprint, newer, 2);
        assertEq(r.latest(keccak256(abi.encode(uint256(1), hook))), newer);
        (address saved,,,,,,) = r.publications(report);
        assertEq(saved, hook);
    }

    function testUnauthorizedPublisher() public {
        vm.prank(address(0xbad));
        vm.expectRevert(HookRiskRegistry.Unauthorized.selector);
        r.publish(hook, 1, fingerprint, report, 1);
    }

    function testGrantRevoke() public {
        r.setPublisher(address(0xbee), true);
        vm.prank(address(0xbee));
        r.publish(hook, 1, fingerprint, report, 1);
        r.setPublisher(address(0xbee), false);
        vm.prank(address(0xbee));
        vm.expectRevert(HookRiskRegistry.Unauthorized.selector);
        r.publish(hook, 1, fingerprint, keccak256("other"), 1);
    }

    function testDuplicate() public {
        r.publish(hook, 1, fingerprint, report, 1);
        vm.expectRevert(HookRiskRegistry.DuplicatePublication.selector);
        r.publish(hook, 1, fingerprint, report, 1);
    }

    function testInvalidInput() public {
        vm.expectRevert(HookRiskRegistry.InvalidPublication.selector);
        r.publish(address(0), 1, fingerprint, report, 1);
        vm.expectRevert(HookRiskRegistry.InvalidPublication.selector);
        r.publish(hook, 1, fingerprint, report, 4);
    }

    function testOwnerOnlyConfiguration() public {
        vm.prank(address(0xbad));
        vm.expectRevert(HookRiskRegistry.Unauthorized.selector);
        r.setPublisher(address(0xbad), true);
    }

    function testForwarderAndWorkflowRequired() public {
        bytes32 wid = keccak256("authorized workflow");
        address f = address(0xfeed);
        r.setForwarder(f);
        bytes memory metadata = abi.encodePacked(wid, bytes10("hscan"), address(this), bytes2(0));
        bytes memory payload = abi.encode(hook, uint256(1), fingerprint, report, uint8(1));
        vm.prank(f);
        vm.expectRevert(HookRiskRegistry.Unauthorized.selector);
        r.onReport(metadata, payload);
        r.setWorkflow(wid, true);
        vm.prank(f);
        r.onReport(metadata, payload);
        (address saved,,,,,,) = r.publications(report);
        assertEq(saved, hook);
    }

    function testReceiverInterfaceDetection() public view {
        assertTrue(r.supportsInterface(0x01ffc9a7));
        assertTrue(r.supportsInterface(bytes4(keccak256("onReport(bytes,bytes)"))));
        assertFalse(r.supportsInterface(0xffffffff));
    }

    function testMalformedMetadataRejected() public {
        bytes32 wid = keccak256("authorized workflow");
        r.setForwarder(address(this));
        r.setWorkflow(wid, true);
        vm.expectRevert(HookRiskRegistry.Unauthorized.selector);
        r.onReport(abi.encodePacked(wid), abi.encode(hook, uint256(1), fingerprint, report, uint8(1)));
    }

    function testPublicationEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit HookRiskRegistry.Published(hook, 1, report, fingerprint, 1, address(this));
        r.publish(hook, 1, fingerprint, report, 1);
    }
}
