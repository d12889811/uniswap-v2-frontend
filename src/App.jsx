// src/App.jsx
import React, { useState } from "react";
import PoolSelector from "./components/PoolSelector";
import DepositRedeemSwap from "./components/DepositRedeemSwap";
import Charts from "./components/Charts";
import CreatePool from "./components/CreatePool";

function App() {
    const [selectedPool, setSelectedPool] = useState(null);
    const [poolRefreshCounter, setPoolRefreshCounter] = useState(0);

    const refreshPools = () => {
        setPoolRefreshCounter(prev => prev + 1);
    };

    return (
        <div className="App">
            <h1>Uniswap V2 UI</h1>
            <CreatePool refreshPools={refreshPools} />
            <PoolSelector setSelectedPool={setSelectedPool} poolRefreshCounter={poolRefreshCounter} />
            {selectedPool && (
                <>
                    <DepositRedeemSwap poolAddress={selectedPool} refreshPools={refreshPools} />
                    {/* key 设置为 selectedPool 以确保切换池子时 Charts 组件重新挂载 */}
                    <Charts key={selectedPool} poolAddress={selectedPool} refreshPools={refreshPools} />
                </>
            )}
        </div>
    );
}

export default App;
