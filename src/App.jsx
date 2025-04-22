// src/App.jsx
import React, { useEffect, useState } from "react";
import TestSuite from "./components/TestSuite"; // ✅ 添加导入
import PoolSelector        from "./components/PoolSelector";
import DepositRedeemSwap   from "./components/DepositRedeemSwap";
import Charts              from "./components/Charts";
import CreatePool          from "./components/CreatePool";
import NLBox               from "./components/NLBox";

import { buildTokenRegistry } from "./TokenRegistry.jsx";   // ← 小写 t，扩展名 .js

function App() {
    /* ---------- 链上 Token 列表，随池子刷新 ---------- */
    const [tokenRegistry, setTokenRegistry] = useState(null);

    /* ---------- 池子相关状态 ---------- */
    const [selectedPool, setSelectedPool]   = useState(null);
    const [poolRefreshCounter, setCounter]  = useState(0);  // 每 +1 触发重扫

    /** 供子组件调用：CreatePool / DepositRedeemSwap 完成后调用即可 */
    const refreshPools = () => setCounter(prev => prev + 1);
    useEffect(() => {
        window.setSelectedPool = setSelectedPool;
        window.refreshPools = refreshPools;
    }, []);
    useEffect(() => {
        console.log("📌 当前选中池子 =", selectedPool);
    }, [selectedPool]);
    /* ---------- 扫描 Factory，生成 / 更新 tokenRegistry ---------- */
    useEffect(() => {
        buildTokenRegistry()
            .then(setTokenRegistry)
            .catch(err => {
                console.error("读取链上 Token 信息失败:", err);
                alert("读取链上 Token 信息失败，请检查 RPC / Factory 地址");
            });
    }, [poolRefreshCounter]);               // ← 依赖计数器，确保新增池子后重扫

    /* ---------- Loading ---------- */
    if (!tokenRegistry) {
        return (
            <div style={{ padding: "1rem" }}>
                <h2>Uniswap V2 UI</h2>
                <p>正在扫描链上 Token，请稍候…</p>
            </div>
        );
    }

    /* ---------- 正常渲染 ---------- */
    return (
        <div className="App" style={{ padding: "1rem" }}>
            <h1>Uniswap V2 UI + NL Interaction</h1>

            {/* NL 输入框：把最新 tokenRegistry 传给它 */}
            {/* 并排布局容器 */}
            <div style={{ display: "flex", alignItems: "flex-start" }}>
                <NLBox
                    tokenRegistry={tokenRegistry}
                    setSelectedPool={setSelectedPool}
                    refreshPools={refreshPools}
                />
                <TestSuite />
            </div>

            {/* 创建新池子；成功后会调用 refreshPools → 重扫 token & 池列表 */}
            <CreatePool refreshPools={refreshPools} />

            {/* 选择池子；内部同样依赖 poolRefreshCounter */}
            <PoolSelector
                selectedPool={selectedPool}           // ✅ 传入选中地址
                setSelectedPool={setSelectedPool}
                poolRefreshCounter={poolRefreshCounter}
                refreshPools={refreshPools}
            />

            {/* 选中池子后显示存取款、图表等 */}
            {selectedPool && (
                <>
                    <DepositRedeemSwap
                        poolAddress={selectedPool}
                        refreshPools={refreshPools}
                    />
                    {/* key=selectedPool 强制切池子时重建组件，清空旧数据 */}
                    <Charts
                        key={selectedPool}
                        poolAddress={selectedPool}
                        refreshPools={refreshPools}
                    />
                </>
            )}
        </div>
    );
}

export default App;
