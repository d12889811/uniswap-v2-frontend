import { ethers } from 'ethers';
import factoryAbi from './abis/UniswapV2Factory.json';
import pairAbi    from './abis/UniswapV2Pair.json';
import routerAbi  from './abis/UniswapV2Router02.json';
import erc20Abi   from './abis/ERC20.json';
import { logAction } from "./utils/logAction";

const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);

function getSigner() {
    if (!window.ethereum) throw new Error('MetaMask 未检测到');
    return (new ethers.BrowserProvider(window.ethereum)).getSigner();
}

export async function selectPool({ symbolA, symbolB, poolId }) {
    if (poolId && ethers.isAddress(poolId)) {
        return { poolAddress: poolId };
    }

    if (poolId && poolId.includes("-")) {
        const [symA, symB] = poolId.split("-");
        symbolA = symA;
        symbolB = symB;
    }

    if (!symbolA || !symbolB) {
        throw new Error("selectPool 需要 symbolA + symbolB，或 poolId");
    }

    const factory = new ethers.Contract(
        import.meta.env.VITE_FACTORY_ADDRESS,
        factoryAbi,
        provider
    );
    const total = await factory.allPairsLength();

    for (let i = 0; i < total; i++) {
        const pairAddr = await factory.allPairs(i);
        const pair = new ethers.Contract(pairAddr, pairAbi, provider);

        const token0 = await pair.token0();
        const token1 = await pair.token1();

        const symbol0 = (await new ethers.Contract(token0, erc20Abi, provider).symbol()).toLowerCase();
        const symbol1 = (await new ethers.Contract(token1, erc20Abi, provider).symbol()).toLowerCase();

        if (
            (symbol0 === symbolA.toLowerCase() && symbol1 === symbolB.toLowerCase()) ||
            (symbol0 === symbolB.toLowerCase() && symbol1 === symbolA.toLowerCase())
        ) {
            return { poolAddress: pairAddr };
        }
    }

    throw new Error(`Factory 中找不到 ${symbolA}-${symbolB} 池`);
}

export async function createPool({ tokenA, tokenB }) {
    const signer  = await getSigner();
    const factory = new ethers.Contract(
        import.meta.env.VITE_FACTORY_ADDRESS,
        factoryAbi,
        signer
    );

    const tx      = await factory.createPair(tokenA, tokenB);
    const receipt = await tx.wait();

    const iface   = new ethers.Interface(factoryAbi);
    const log     = receipt.logs.find(l =>
        l.topics[0] === iface.getEvent("PairCreated").topicHash
    );
    const decoded = iface.parseLog(log);
    const pair    = decoded.args.pair;

    return { txHash: tx.hash, poolAddress: pair };
}

export async function deposit({ poolAddress, amountA, amountB }) {
    const signer = await getSigner();
    const pair = new ethers.Contract(poolAddress, pairAbi, signer);
    const [t0, t1] = [await pair.token0(), await pair.token1()];
    const [tok0, tok1] = [
        new ethers.Contract(t0, erc20Abi, signer),
        new ethers.Contract(t1, erc20Abi, signer)
    ];

    const a0 = ethers.parseUnits(amountA.toString(), 18);
    const a1UserInput = ethers.parseUnits(amountB.toString(), 18);

    // 获取池子的当前储备
    const [r0, r1] = await pair.getReserves();

    let finalA0, finalA1;
    if (r0 === 0n && r1 === 0n) {
        // 首次添加流动性，直接用用户输入的两个代币数量
        finalA0 = a0;
        finalA1 = a1UserInput;
    } else {
        // 池子已有储备，保持比例，token0 用用户输入，token1 按比例算
        finalA0 = a0;
        finalA1 = (a0 * r1) / r0;
    }

    await (await tok0.transfer(poolAddress, finalA0)).wait();
    await (await tok1.transfer(poolAddress, finalA1)).wait();
    const tx = await pair.mint(await signer.getAddress());
    await tx.wait();

    logAction({
        type: "deposit",
        poolAddress,
        token0: t0,
        token1: t1,
        amount0: finalA0.toString(),
        amount1: finalA1.toString(),
        txHash: tx.hash
    });

    return { deposited: true };
}

export async function redeem({ poolAddress, percent }) {
    const signer = await getSigner();
    const pair   = new ethers.Contract(poolAddress, pairAbi, signer);
    const user   = await signer.getAddress();
    const bal    = await pair.balanceOf(user);
    const amt    = bal * BigInt(percent) / 100n;
    await (await pair.transfer(poolAddress, amt)).wait();
    const tx = await pair.burn(user);
    await tx.wait();

    const [t0, t1] = [await pair.token0(), await pair.token1()];

    logAction({
        type: "redeem",
        poolAddress,
        token0: t0,
        token1: t1,
        amount0: "calculated_on_chain",  // 可选改成准确值
        amount1: "calculated_on_chain",
        txHash: tx.hash
    });

    return { redeemed: true };
}

export async function swap({ poolAddress, amount, amountOut, fromSymbol, toSymbol }) {
    const signer = await getSigner();
    const pair   = new ethers.Contract(poolAddress, pairAbi, signer);

    if (!fromSymbol || !toSymbol) {
        throw new Error("swap 缺少 fromSymbol 或 toSymbol 参数");
    }

    const token0 = await pair.token0();
    const token1 = await pair.token1();

    const [symbol0, symbol1] = await Promise.all([
        new ethers.Contract(token0, erc20Abi, signer).symbol(),
        new ethers.Contract(token1, erc20Abi, signer).symbol()
    ]);

    const [r0, r1] = await pair.getReserves();

    // 判断方向
    let inputToken, outputToken, reserveIn, reserveOut;
    let amount0Out = 0n, amount1Out = 0n;
    let isToken0To1 = fromSymbol.toLowerCase() === symbol0.toLowerCase() && toSymbol.toLowerCase() === symbol1.toLowerCase();

    if (isToken0To1) {
        inputToken  = token0;
        outputToken = token1;
        reserveIn   = r0;
        reserveOut  = r1;
    } else if (fromSymbol.toLowerCase() === symbol1.toLowerCase() && toSymbol.toLowerCase() === symbol0.toLowerCase()) {
        inputToken  = token1;
        outputToken = token0;
        reserveIn   = r1;
        reserveOut  = r0;
    } else {
        throw new Error(`池子不包含 ${fromSymbol} 和 ${toSymbol}`);
    }

    // 判断是 exact input 还是 exact output
    let amountIn, outWei;
    if (amount) {
        // exact input
        amountIn = ethers.parseUnits(amount.toString(), 18);

        // Uniswap 公式: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
        const numerator = amountIn * reserveOut * 997n;
        const denominator = reserveIn * 1000n + amountIn * 997n;
        outWei = numerator / denominator;
    } else if (amountOut) {
        outWei = ethers.parseUnits(amountOut.toString(), 18);

        // Uniswap 公式: amountIn = (reserveIn * out * 1000) / ((reserveOut - out) * 997) + 1
        const numerator = reserveIn * outWei * 1000n;
        const denominator = (reserveOut - outWei) * 997n;
        amountIn = (numerator / denominator) + 1n;
    } else {
        throw new Error("swap 缺少 amount 或 amountOut 参数");
    }

    if (isToken0To1) {
        amount1Out = outWei;
    } else {
        amount0Out = outWei;
    }

    const inputContract = new ethers.Contract(inputToken, erc20Abi, signer);
    const tx1 = await inputContract.transfer(poolAddress, amountIn);
    await tx1.wait();

    const tx2 = await pair.swap(
        amount0Out,
        amount1Out,
        await signer.getAddress(),
        "0x"
    );
    await tx2.wait();

    logAction({
        type: "swap",
        poolAddress,
        token0,
        token1,
        amount0: amount0Out.toString(),
        amount1: amount1Out.toString(),
        txHash: tx2.hash
    });

    return {
        swapped: true,
        input: amountIn.toString(),
        output: outWei.toString(),
        fromSymbol,
        toSymbol,
        txHash: tx2.hash
    };
}



export async function getReserves({ poolAddress }) {
    const pair = new ethers.Contract(poolAddress, pairAbi, provider);
    const [r0, r1] = await pair.getReserves();
    const [t0, t1] = [await pair.token0(), await pair.token1()];

    const token0 = new ethers.Contract(t0, erc20Abi, provider);
    const token1 = new ethers.Contract(t1, erc20Abi, provider);
    const s0 = await token0.symbol();
    const s1 = await token1.symbol();

    return {
        reserves: {
            [s0]: ethers.formatUnits(r0, 18),
            [s1]: ethers.formatUnits(r1, 18),
        },
        token0: s0,
        token1: s1,
        poolAddress
    };
}

// src/actions/countActions.js 或加到原 actions.js 中
export async function countActions({ type = "swap", poolAddress, date }) {
    const logs = JSON.parse(localStorage.getItem("txLogs") || "[]");

    // 默认今天（按本地时区）
    const today = new Date();
    const yyyy_mm_dd = date || today.toISOString().slice(0, 10);  // e.g., 2025-04-21

    const [year, month, day] = yyyy_mm_dd.split("-").map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0);
    const end = new Date(year, month - 1, day + 1, 0, 0, 0);

    const filtered = logs.filter(log => {
        if (log.type !== type) return false;
        if (poolAddress && log.poolAddress?.toLowerCase() !== poolAddress.toLowerCase()) return false;
        const ts = new Date(log.timestamp);
        return ts >= start && ts < end;
    });

    return {
        type,
        count: filtered.length,
        date: yyyy_mm_dd,
        poolAddress: poolAddress || "any"
    };
}





