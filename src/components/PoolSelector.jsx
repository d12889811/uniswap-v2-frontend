// src/components/PoolSelector.jsx
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import factoryAbi from "../abis/UniswapV2Factory.json";
import pairAbi from "../abis/UniswapV2Pair.json";
import erc20Abi from "../abis/ERC20.json";

const PoolSelector = ({ selectedPool, setSelectedPool, poolRefreshCounter, refreshPools }) => {
    const [pairs, setPairs] = useState([]);
    const [loading, setLoading] = useState(false);
    // 用于记录当前选中的 pool 地址
    useEffect(() => {
        async function fetchPools() {
            try {
                setLoading(true);
                const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
                const factory = new ethers.Contract(
                    import.meta.env.VITE_FACTORY_ADDRESS,
                    factoryAbi,
                    provider
                );
                const length = await factory.allPairsLength();
                console.log("All pairs length:", length.toString());
                let poolList = [];
                for (let i = 0; i < length; i++) {
                    try {
                        const pairAddress = await factory.allPairs(i);
                        const pair = new ethers.Contract(pairAddress, pairAbi, provider);
                        const token0Address = await pair.token0();
                        const token1Address = await pair.token1();
                        const token0Contract = new ethers.Contract(token0Address, erc20Abi, provider);
                        const token1Contract = new ethers.Contract(token1Address, erc20Abi, provider);

                        let symbol0 = await token0Contract.symbol();
                        let symbol1 = await token1Contract.symbol();

                        poolList.push({ address: pairAddress, token0: symbol0, token1: symbol1 });
                    } catch (err) {
                        console.warn(`⚠️ Skipping pair[${i}] due to error:`, err);
                        continue;
                    }
                }
                setPairs(poolList);
                setLoading(false);
            } catch (error) {
                console.error("Error fetching pools:", error);
                setLoading(false);
            }
        }
        fetchPools();
    }, [poolRefreshCounter]);

    const handleSelect = (poolAddr) => {
        setSelectedPool(poolAddr);
        window.selectedPool = poolAddr;   // ✅ 同步更新全局变量

        if (refreshPools) {
            refreshPools();
        }
    };

    return (
        <div>
            <h2>Select a Pool</h2>
            {loading ? (
                <p>Loading pools...</p>
            ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                    {pairs.map((pool, index) => (
                        <li key={index} style={{ margin: "0.5rem 0" }}>
                            <button
                                onClick={() => handleSelect(pool.address)}
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor:
                                        pool.address.toLowerCase() === selectedPool?.toLowerCase() ? "#007bff" : "#eee",
                                    color:
                                        pool.address.toLowerCase()=== selectedPool?.toLowerCase() ? "#fff" : "#000",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                {pool.token0} - {pool.token1}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default PoolSelector;
