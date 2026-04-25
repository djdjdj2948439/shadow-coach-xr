"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, PerspectiveCamera } from "@react-three/drei";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";

// 1. 建立一個獨立的機器人組件
function Robot() {
  const robotRef = useRef<THREE.Mesh>(null);

  // 記錄按鍵狀態
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => setKeys((k) => ({ ...k, [e.key.toLowerCase()]: true }));
    const handleKeyUp = (e: KeyboardEvent) => setKeys((k) => ({ ...k, [e.key.toLowerCase()]: false }));
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // 每幀更新機器人位置 (微重力環境下的簡單平移)
  useFrame(() => {
    if (!robotRef.current) return;
    const speed = 0.05; // 移動速度
    if (keys.w) robotRef.current.position.z -= speed; // 前進
    if (keys.s) robotRef.current.position.z += speed; // 後退
    if (keys.a) robotRef.current.position.x -= speed; // 左移
    if (keys.d) robotRef.current.position.x += speed; // 右移
  });

  return (
    <mesh ref={robotRef} position={[0, 0, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="blue" />
    </mesh>
  );
}

export default function Experience() {
  return (
    <div className="w-full h-screen bg-black">
      <Canvas>
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />

        {/* 2. 使用剛剛寫好的 Robot 組件 */}
        <Robot />

        {/* 任務目標：漂浮的工具 */}
        <mesh position={[2, 1, -3]}>
          <sphereGeometry args={[0.3, 32, 32]} />
          <meshStandardMaterial color="orange" />
        </mesh>

        <PerspectiveCamera makeDefault position={[5, 5, 5]} />
        <OrbitControls />
      </Canvas>

      {/* 操作提示 UI */}
      <div className="absolute bottom-10 left-10 text-white bg-white/20 p-4 rounded-lg pointer-events-none">
        <h1 className="font-bold mb-2">Orbital Skill Habitat</h1>
        <p>控制方式: W, A, S, D 移動藍色機器人</p>
        <p>滑鼠左鍵: 旋轉視角</p>
      </div>
    </div>
  );
}
