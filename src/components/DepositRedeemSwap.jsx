// src/components/DepositRedeemSwap.jsx
import React, { useState } from "react";
import { ethers } from "ethers";
import pairAbi from "../abis/UniswapV2Pair.json";
import erc20Abi from "../abis/ERC20.json"; // ERC20 ABI 文件

const DepositRedeemSwap = ({ poolAddress, refreshPools }) => {
    const [action, setAction] = useState("deposit"); // deposit, redeem, swap
    // 存储 token0 和 token1 的数量（字符串，单位为 token 数量，假设都是18位小数）
    const [amountToken0, setAmountToken0] = useState("");
    const [amountToken1, setAmountToken1] = useState("");
    const [swapOutput, setSwapOutput] = useState("");
    const [redeemPercent, setRedeemPercent] = useState("");

    async function handleAction() {
        if (!window.ethereum) {
            alert("MetaMask is required");
            return;
        }
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const pool = new ethers.Contract(poolAddress, pairAbi, signer);

        try {
            if (action === "deposit") {
                // 获取 token0 和 token1 地址
                const token0Address = await pool.token0();
                const token1Address = await pool.token1();
                console.log("Pair token0:", token0Address, "token1:", token1Address);

                // 构造 token 实例
                const token0 = new ethers.Contract(token0Address, erc20Abi, signer);
                const token1 = new ethers.Contract(token1Address, erc20Abi, signer);

                // 将用户输入转换为 wei 数量（BigInt），假设均为18位小数
                const depositAmount0 = ethers.parseUnits(amountToken0, 18);
                const depositAmount1UserInput = ethers.parseUnits(amountToken1, 18);
                console.log("User input - Deposit token0 amount (wei):", depositAmount0.toString());
                console.log("User input - Deposit token1 amount (wei):", depositAmount1UserInput.toString());

                // 获取当前池子储备
                const reserves = await pool.getReserves();
                const r0 = reserves[0]; // BigInt
                const r1 = reserves[1]; // BigInt
                console.log("Current reserves:", ethers.formatUnits(r0, 18), ethers.formatUnits(r1, 18));

                let finalDepositAmount0, finalDepositAmount1;
                if (r0 === 0n && r1 === 0n) {
                    // 首次添加流动性：池子为空，直接使用用户输入的两个 token 数量
                    finalDepositAmount0 = depositAmount0;
                    finalDepositAmount1 = depositAmount1UserInput;
                    console.log("Pool is empty, using user input amounts directly.");
                } else {
                    // 池子非空：保持比例，token0 按用户输入，token1 按比例计算
                    finalDepositAmount0 = depositAmount0;
                    finalDepositAmount1 = (depositAmount0 * r1) / r0;
                    console.log("Pool not empty, calculated deposit token1 amount (wei):", finalDepositAmount1.toString());
                }

                // 执行转账：将 token0 和 token1 从用户钱包转入池子合约（注意，转出的 token 来源于用户）
                let tx = await token0.transfer(poolAddress, finalDepositAmount0);
                await tx.wait();
                console.log("Token0 transfer tx hash:", tx.hash);

                tx = await token1.transfer(poolAddress, finalDepositAmount1);
                await tx.wait();
                console.log("Token1 transfer tx hash:", tx.hash);

                // 调用 mint() 为用户铸造 LP 代币
                const newReserves = await pool.getReserves();
                console.log("New reserves:",
                    ethers.formatUnits(newReserves[0], 18),
                    ethers.formatUnits(newReserves[1], 18));
                tx = await pool.mint(await signer.getAddress());
                await tx.wait();
                console.log("Mint tx hash:", tx.hash);
                alert("Deposit successful");
            } else if (action === "redeem") {
                // Redeem 分支：计算用户赎回的 LP 数量
                const userAddress = await signer.getAddress();
                const lpBalance = await pool.balanceOf(userAddress);
                const totalSupply = await pool.totalSupply();
                const reserves = await pool.getReserves();
                console.log(
                    "Current reserves in redeem:",
                    "token0 =", ethers.formatUnits(reserves[0], 18),
                    "token1 =", ethers.formatUnits(reserves[1], 18)
                );
                console.log("User LP token balance:", ethers.formatUnits(lpBalance, 18));
                console.log("Total LP token supply:", ethers.formatUnits(totalSupply, 18));

                const redeemPct = BigInt(parseInt(redeemPercent, 10));
                if (redeemPct <= 0n || redeemPct > 100n) {
                    throw new Error("请输入正确的赎回比例（1-100）");
                }
                const redeemAmount = (lpBalance * redeemPct) / 100n;
                console.log("Redeeming LP tokens:", ethers.formatUnits(redeemAmount, 18));

                // 计算预期获得的 token 数量
                const expectedToken0 = (redeemAmount * reserves[0]) / totalSupply;
                const expectedToken1 = (redeemAmount * reserves[1]) / totalSupply;
                console.log(
                    "Expected token returns: token0 =",
                    ethers.formatUnits(expectedToken0, 18),
                    "token1 =",
                    ethers.formatUnits(expectedToken1, 18)
                );
                if (expectedToken0 === 0n || expectedToken1 === 0n) {
                    throw new Error("赎回金额太小，预期返回为0");
                }

                // 将用户赎回的 LP 代币转入池子合约，再调用 burn() 销毁 LP 代币并返还 token
                let tx = await pool.transfer(poolAddress, redeemAmount);
                await tx.wait();
                console.log("Transferred LP tokens to pair for burning, tx hash:", tx.hash);

                tx = await pool.burn(userAddress);
                await tx.wait();
                console.log("Burn (redeem) tx executed, tx hash:", tx.hash);
                alert("Redeem successful");
            } else if (action === "swap") {
                // Swap 分支：计算需要的 token0 输入并执行 swap 操作
                const desiredOutput = ethers.parseUnits(swapOutput, 18);
                console.log("Desired output (token1):", ethers.formatUnits(desiredOutput, 18));
                const reserves = await pool.getReserves();
                const reserve0 = reserves[0];
                const reserve1 = reserves[1];
                console.log(
                    "Before swap - Reserves: reserve0 =",
                    ethers.formatUnits(reserve0, 18),
                    "reserve1 =",
                    ethers.formatUnits(reserve1, 18)
                );
                if (desiredOutput >= reserve1) {
                    throw new Error("Desired output exceeds pool liquidity");
                }
                const numerator = reserve0 * desiredOutput * 1000n;
                const denominator = (reserve1 - desiredOutput) * 997n;
                const requiredInput = (numerator / denominator) + 1n;
                console.log("Calculated required token0 input (wei):", requiredInput.toString());
                const token0Address = await pool.token0();
                const token0 = new ethers.Contract(token0Address, erc20Abi, signer);
                let tx = await token0.transfer(poolAddress, requiredInput);
                await tx.wait();
                console.log("Pre-transfer of token0 complete, tx hash:", tx.hash);
                tx = await pool.swap(
                    0,
                    desiredOutput,
                    await signer.getAddress(),
                    "0x"
                );
                await tx.wait();
                console.log("Swap transaction executed, tx hash:", tx.hash);
                alert("Swap successful");
            }
            if (refreshPools) refreshPools();
        } catch (error) {
            console.error("Transaction error:", error);
            alert("Transaction failed: " + error.message);
        }
    }

    return (
        <div>
            <h2>Deposit / Redeem / Swap</h2>
            <div>
                <label>
                    <input
                        type="radio"
                        name="action"
                        value="deposit"
                        checked={action === "deposit"}
                        onChange={() => setAction("deposit")}
                    />
                    Deposit
                </label>
                <label>
                    <input
                        type="radio"
                        name="action"
                        value="redeem"
                        checked={action === "redeem"}
                        onChange={() => setAction("redeem")}
                    />
                    Redeem
                </label>
                <label>
                    <input
                        type="radio"
                        name="action"
                        value="swap"
                        checked={action === "swap"}
                        onChange={() => setAction("swap")}
                    />
                    Swap
                </label>
            </div>
            {action === "deposit" && (
                <div>
                    <label>
                        Amount to Deposit for Token 0 (in token units):
                        <input
                            type="text"
                            value={amountToken0}
                            onChange={(e) => setAmountToken0(e.target.value)}
                            placeholder="e.g., 1"
                        />
                    </label>
                    <label>
                        Amount to Deposit for Token 1 (in token units):
                        <input
                            type="text"
                            value={amountToken1}
                            onChange={(e) => setAmountToken1(e.target.value)}
                            placeholder="e.g., 1"
                        />
                    </label>
                </div>
            )}
            {action === "redeem" && (
                <div>
                    <label>
                        Redemption Percentage (0 ~ 100):
                        <input
                            type="text"
                            value={redeemPercent}
                            onChange={(e) => setRedeemPercent(e.target.value)}
                            placeholder="e.g., 50"
                        />
                    </label>
                </div>
            )}
            {action === "swap" && (
                <div>
                    <label>
                        Desired Output Amount for Token 1 (in token units):
                        <input
                            type="text"
                            value={swapOutput}
                            onChange={(e) => setSwapOutput(e.target.value)}
                            placeholder="e.g., 1"
                        />
                    </label>
                </div>
            )}
            <button onClick={handleAction}>Submit {action}</button>
        </div>
    );
};

export default DepositRedeemSwap;
