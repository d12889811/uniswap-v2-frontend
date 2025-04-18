// src/components/Charts.jsx
import React, { useState, useEffect } from "react";
import { Line, Bar } from "react-chartjs-2";
import {
    Chart,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
} from "chart.js";
import { ethers } from "ethers";
import pairAbi from "../abis/UniswapV2Pair.json";
import erc20Abi from "../abis/ERC20.json";

Chart.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const Charts = ({ poolAddress, refreshPools }) => {
    const [symbols, setSymbols] = useState({ token0: "", token1: "" });
    const [reserveData, setReserveData] = useState({
        labels: [],
        datasets: [
            { label: "Reserve 0", data: [], borderColor: "blue", fill: false },
            { label: "Reserve 1", data: [], borderColor: "red", borderDash: [5, 5], fill: false }
        ]
    });
    const [priceData, setPriceData] = useState({
        labels: [],
        datasets: [
            { label: "Execution Price", data: [], backgroundColor: "rgba(75, 192, 192, 0.6)" }
        ]
    });
    const [curveData, setCurveData] = useState({
        labels: [],
        datasets: [
            { label: "Invariant Curve (y = k/x)", data: [], borderColor: "green", fill: false }
        ]
    });

    const generateInvariantCurve = (reserve0, reserve1) => {
        const r0 = Number(reserve0);
        const r1 = Number(reserve1);
        const k = r0 * r1;
        const xMin = r0 * 0.5;
        const xMax = r0 * 1.5;
        const numPoints = 20;
        const xValues = [];
        const yValues = [];
        for (let i = 0; i < numPoints; i++) {
            const x = xMin + ((xMax - xMin) * i) / (numPoints - 1);
            xValues.push(x.toFixed(4));
            const y = k / x;
            yValues.push(Number(y.toFixed(4)));
        }
        return { labels: xValues, data: yValues };
    };

    useEffect(() => {
        if (!poolAddress) return;

        const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
        const pool = new ethers.Contract(poolAddress, pairAbi, provider);

        const fetchSymbols = async () => {
            const token0Address = await pool.token0();
            const token1Address = await pool.token1();
            const token0 = new ethers.Contract(token0Address, erc20Abi, provider);
            const token1 = new ethers.Contract(token1Address, erc20Abi, provider);
            const symbol0 = await token0.symbol();
            const symbol1 = await token1.symbol();
            setSymbols({ token0: symbol0, token1: symbol1 });
        };

        const fetchData = async () => {
            try {
                const reserves = await pool.getReserves();
                const reserve0Formatted = ethers.formatUnits(reserves[0], 18);
                const reserve1Formatted = ethers.formatUnits(reserves[1], 18);
                const timestamp = new Date().toLocaleTimeString();

                setReserveData(prev => ({
                    labels: [...prev.labels, timestamp],
                    datasets: [
                        {
                            ...prev.datasets[0],
                            label: `Reserve ${symbols.token0}`,
                            data: [...prev.datasets[0].data, Number(reserve0Formatted)]
                        },
                        {
                            ...prev.datasets[1],
                            label: `Reserve ${symbols.token1}`,
                            data: [...prev.datasets[1].data, Number(reserve1Formatted)]
                        }
                    ]
                }));

                let price = 0;
                if (Number(reserve0Formatted) > 0) {
                    price = Number(reserve1Formatted) / Number(reserve0Formatted);
                }
                setPriceData(prev => ({
                    labels: [...prev.labels, timestamp],
                    datasets: [
                        {
                            ...prev.datasets[0],
                            label: `${symbols.token1} per ${symbols.token0}`,
                            data: [...prev.datasets[0].data, price]
                        }
                    ]
                }));

                const curve = generateInvariantCurve(reserve0Formatted, reserve1Formatted);
                setCurveData({
                    labels: curve.labels,
                    datasets: [
                        {
                            label: `Invariant Curve (${symbols.token0}-${symbols.token1})`,
                            data: curve.data,
                            borderColor: "green",
                            fill: false
                        }
                    ]
                });

            } catch (error) {
                console.error("Error fetching reserves:", error);
            }
        };

        fetchSymbols();
        fetchData();
        const interval = setInterval(fetchData, 10000);

        return () => clearInterval(interval);
    }, [poolAddress, refreshPools]);

    return (
        <div>
            <h2> Reserves Curve ({symbols.token0} / {symbols.token1}) </h2>
            <Line
                data={reserveData}
                options={{
                    responsive: true,
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: `Token Amount (${symbols.token0} / ${symbols.token1})`
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: "Time"
                            }
                        }
                    }
                }}
            />
            <h2>Execution Price Distribution ({symbols.token1} per {symbols.token0})</h2>
            <Bar
                data={priceData}
                options={{
                    responsive: true,
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: `Price (${symbols.token1} / ${symbols.token0})`
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: "Time"
                            }
                        }
                    }
                }}
            />
            <h2>Invariant Curve ({symbols.token0}-{symbols.token1})</h2>
            <Line
                data={curveData}
                options={{
                    responsive: true,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: symbols.token0
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: symbols.token1
                            }
                        }
                    }
                }}
            />
        </div>
    );
};

export default Charts;
