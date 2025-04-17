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

    // 用于生成不变量曲线数据，曲线形状为 y = k/x
    const generateInvariantCurve = (reserve0, reserve1) => {
        const r0 = Number(reserve0);
        const r1 = Number(reserve1);
        const k = r0 * r1;
        // 以当前reserve0为中心，选取附近 50%~150% 的范围
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

        // 定时和事件监听函数，用于获取储备、计算价格、更新不变量曲线
        const fetchData = async () => {
            try {
                const reserves = await pool.getReserves();
                const reserve0Formatted = ethers.formatUnits(reserves[0], 18);
                const reserve1Formatted = ethers.formatUnits(reserves[1], 18);
                console.log("Chart update - Reserves:", reserve0Formatted, reserve1Formatted);
                const timestamp = new Date().toLocaleTimeString();

                // 更新储备曲线
                setReserveData(prev => ({
                    labels: [...prev.labels, timestamp],
                    datasets: [
                        {
                            ...prev.datasets[0],
                            data: [...prev.datasets[0].data, Number(reserve0Formatted)]
                        },
                        {
                            ...prev.datasets[1],
                            data: [...prev.datasets[1].data, Number(reserve1Formatted)]
                        }
                    ]
                }));

                // 计算执行价格：reserve1 / reserve0
                let price = 0;
                if (Number(reserve0Formatted) > 0) {
                    price = Number(reserve1Formatted) / Number(reserve0Formatted);
                }
                console.log("Calculated price:", price);
                setPriceData(prev => ({
                    labels: [...prev.labels, timestamp],
                    datasets: [
                        {
                            ...prev.datasets[0],
                            data: [...prev.datasets[0].data, price]
                        }
                    ]
                }));

                // 计算并更新不变量曲线数据
                const curve = generateInvariantCurve(reserve0Formatted, reserve1Formatted);
                setCurveData({
                    labels: curve.labels,
                    datasets: [
                        {
                            label: "Invariant Curve (y = k/x)",
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

        // 初次调用
        fetchData();

        // 设置定时器，每10秒刷新一次数据
        const interval = setInterval(fetchData, 10000);

        // 监听 Swap 事件，更新执行价格（以及可选的不变量曲线）
        const swapListener = async (
            sender,
            amount0In,
            amount1In,
            amount0Out,
            amount1Out,
            to,
            reserve0,
            reserve1
        ) => {
            try {
                const r0 = Number(ethers.formatUnits(reserve0, 18));
                const r1 = Number(ethers.formatUnits(reserve1, 18));
                let price = 0;
                if (r0 > 0) {
                    price = r1 / r0;
                }
                const timestamp = new Date().toLocaleTimeString();
                console.log("Swap event detected - Updated reserves:", r0, r1, "price:", price);
                setPriceData(prev => ({
                    labels: [...prev.labels, timestamp],
                    datasets: [
                        {
                            ...prev.datasets[0],
                            data: [...prev.datasets[0].data, price]
                        }
                    ]
                }));

                // 当 Swap 事件触发时，也更新不变量曲线
                const curve = generateInvariantCurve(r0, r1);
                setCurveData({
                    labels: curve.labels,
                    datasets: [
                        {
                            label: "Invariant Curve (y = k/x)",
                            data: curve.data,
                            borderColor: "green",
                            fill: false
                        }
                    ]
                });
            } catch (e) {
                console.error("Error in swapListener:", e);
            }
        };

        pool.on("Swap", swapListener);

        return () => {
            clearInterval(interval);
            pool.off("Swap", swapListener);
        };
    }, [poolAddress, refreshPools]);

    return (
        <div>
            <h2>Reserves Curve</h2>
            <Line data={reserveData} />
            <h2>Execution Price Distribution</h2>
            <Bar data={priceData} />
            <h2>Invariant Curve (y = k/x)</h2>
            <Line data={curveData} />
        </div>
    );
};

export default Charts;
