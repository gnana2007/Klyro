// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {BaseTestHooks} from "v4-core/src/test/BaseTestHooks.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/src/test/PoolModifyLiquidityTest.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";

/// @notice Test fixture only: fixed one-percent output charge, explicitly observed, not labeled a vulnerability.
contract ObservedFeeHook is BaseTestHooks {
    IPoolManager public immutable manager;
    uint256 public beforeCalls;
    uint256 public afterCalls;
    uint256 public totalFee;

    constructor(IPoolManager m) {
        manager = m;
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        require(msg.sender == address(manager));
        beforeCalls++;
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        override
        returns (bytes4, int128)
    {
        require(msg.sender == address(manager));
        require(params.zeroForOne && params.amountSpecified < 0, "fixture only supports exact-input 0->1");
        require(delta.amount1() >= 0, "negative output");
        afterCalls++;
        uint256 fee = SafeCast.toUint128(delta.amount1()) / 100;
        totalFee += fee;
        manager.take(key.currency1, address(this), fee);
        return (IHooks.afterSwap.selector, SafeCast.toInt128(fee));
    }
}

contract LocalScenario {
    PoolManager public manager;
    MockERC20 public token0;
    MockERC20 public token1;
    PoolSwapTest public swapRouter;
    PoolModifyLiquidityTest public liquidityRouter;
    ObservedFeeHook public hook;
    PoolKey public baselineKey;
    PoolKey public hookKey;
    bool public prepared;
    uint256 public baselineOutput;
    uint256 public hookOutput;
    event SwapObserved(
        bool hooked,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 balance0Before,
        uint256 balance0After,
        uint256 balance1Before,
        uint256 balance1After,
        int128 delta0,
        int128 delta1,
        uint256 gasUsed
    );

    constructor() {
        manager = new PoolManager(address(this));
        MockERC20 a = new MockERC20("Fixture A", "FA", 18);
        MockERC20 b = new MockERC20("Fixture B", "FB", 18);
        (token0, token1) = address(a) < address(b) ? (a, b) : (b, a);
        swapRouter = new PoolSwapTest(manager);
        liquidityRouter = new PoolModifyLiquidityTest(manager);
        token0.mint(address(this), 1e27);
        token1.mint(address(this), 1e27);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);
        token0.approve(address(liquidityRouter), type(uint256).max);
        token1.approve(address(liquidityRouter), type(uint256).max);
    }

    function installHook(bytes32 salt) external {
        require(address(hook) == address(0));
        hook = new ObservedFeeHook{salt: salt}(manager);
        require(uint160(address(hook)) & 16383 == 196, "wrong hook permission address");
    }

    function prepare() external {
        require(!prepared && address(hook) != address(0));
        prepared = true;
        baselineKey = PoolKey(
            Currency.wrap(address(token0)), Currency.wrap(address(token1)), 3000, 60, IHooks(address(0))
        );
        hookKey = PoolKey(Currency.wrap(address(token0)), Currency.wrap(address(token1)), 3000, 60, hook);
        manager.initialize(baselineKey, 79228162514264337593543950336);
        manager.initialize(hookKey, 79228162514264337593543950336);
        liquidityRouter.modifyLiquidity(baselineKey, ModifyLiquidityParams(-120, 120, 1e22, bytes32(0)), "");
        liquidityRouter.modifyLiquidity(hookKey, ModifyLiquidityParams(-120, 120, 1e22, bytes32(0)), "");
    }

    function execute(bool hooked) external returns (uint256 output) {
        require(prepared);
        uint256 before0 = token0.balanceOf(address(this));
        uint256 before1 = token1.balanceOf(address(this));
        uint256 gasBefore = gasleft();
        BalanceDelta delta = swapRouter.swap(
            hooked ? hookKey : baselineKey,
            SwapParams(true, -1e18, 4295128740),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
        uint256 used = gasBefore - gasleft();
        output = token1.balanceOf(address(this)) - before1;
        if (hooked) hookOutput = output;
        else baselineOutput = output;
        emit SwapObserved(
            hooked,
            before0 - token0.balanceOf(address(this)),
            output,
            before0,
            token0.balanceOf(address(this)),
            before1,
            token1.balanceOf(address(this)),
            delta.amount0(),
            delta.amount1(),
            used
        );
    }
}
