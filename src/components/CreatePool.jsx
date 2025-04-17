import React, { useState } from 'react';
import { ethers } from 'ethers';
import factoryAbi from '../abis/UniswapV2Factory.json';

const CreatePool = ({ refreshPools }) => {
    const [tokenA, setTokenA] = useState('');
    const [tokenB, setTokenB] = useState('');
    const [status, setStatus] = useState('');

    const handleCreatePool = async () => {
        console.log("TokenA是:", tokenA, "TokenB是:", tokenB);
        if (!window.ethereum) {
            alert('MetaMask is required.');
            return;
        }
        // 校验地址是否符合格式
        if (!ethers.isAddress(tokenA) || !ethers.isAddress(tokenB)) {
            alert('请输入有效的 Token 地址');
            return;
        }

        try {
            setStatus('Creating pool...');
            // 使用浏览器提供者（MetaMask）获得 signer
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            // 创建 Factory 合约实例，使用 signer 发起写交易
            const factory = new ethers.Contract(
                import.meta.env.VITE_FACTORY_ADDRESS,
                factoryAbi,
                signer
            );
            console.log("Factory address:", import.meta.env.VITE_FACTORY_ADDRESS);

            // 调用 createPair 方法，传入 tokenA 和 tokenB 地址
            const tx = await factory.createPair(tokenA, tokenB);
            setStatus(`Transaction sent: ${tx.hash}`);

            // 等待交易完成，并获取回执
            const receipt = await tx.wait();
            console.log('Transaction receipt:', receipt);

            // 遍历事件数组，查看是否包含 "PairCreated" 事件
            if (receipt.events && receipt.events.length > 0) {
                receipt.events.forEach((event, idx) => {
                    console.log(`Event[${idx}]: ${event.event}`, event.args);
                    if (event.event === "PairCreated") {
                        console.log("PairCreated event details:", event.args);
                    }
                });
            } else {
                console.log("No events were emitted in this transaction.");
            }

            setStatus('Pool created successfully!');

            // 调用刷新回调更新池子列表
            if (typeof refreshPools === 'function') {
                refreshPools();
            }
        } catch (error) {
            console.error('Error creating pool:', error);
            setStatus('Error: ' + error.message);
        }
    };

    return (
        <div style={{ border: '1px solid #ccc', padding: '1rem', marginTop: '1rem' }}>
            <h2>Create a New Pool</h2>
            <div>
                <label>
                    Token A Address:
                    <input
                        type="text"
                        value={tokenA}
                        onChange={(e) => setTokenA(e.target.value.trim())}
                        placeholder="0x..."
                    />
                </label>
            </div>
            <div>
                <label>
                    Token B Address:
                    <input
                        type="text"
                        value={tokenB}
                        onChange={(e) => setTokenB(e.target.value.trim())}
                        placeholder="0x..."
                    />
                </label>
            </div>
            <button onClick={handleCreatePool}>Create Pool</button>
            {status && <p>{status}</p>}
        </div>
    );
};

export default CreatePool;
