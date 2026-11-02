# R2 贴图晚到的一次性唤醒补丁

视觉冻结输入仍为 `96b63217821df3bbfc3dfc78c26e02bade3669dd`，`manifest-r2.json` 的 source／asset／截图 hash 对应该冻结点。性能线源码审查发现：三张共享图没有 onLoad→invalidate；若图晚于菜单／静态 shot 的有限帧完成，按需渲染可能暂时不展示已加载纹理。

修正仅涉及调度：`WorldFacilitySurface` 的三张图各自 onLoad 通知当前注册 owner；`FacilityReflections` 订阅当前 R3F root.invalidate，订阅时也请求一次，覆盖图先完成、组件后挂载的情况，并确保环境 map effect 更新后有下一帧；cleanup 取消订阅再清除环境借用引用。没有定时器、轮询、额外 useFrame、常驻渲染或新 PMREM。

验证：surface-path 六项源测试通过，新增测试用当前模块代码与可延后完成的 TextureLoader 替身，核对先完成后挂载、晚到两图、共享缓存只加载一次、卸载后不回调、重挂载只补一次；两个改动 TS／TSX transpile syntax 与 diff whitespace 通过。没有重开浏览器做冷加载时序复验，也不把源测试称为网页运行验收。

此补丁不修改 shader GLSL、颜色／材质因子、几何、UV、资源文件或碰撞，18 张原图及其 hash 保留；native source 与 portable 的来源记录仍指向拍摄时的 R2。下一小组 bench／bin 的未接入原型不在本补丁内。

保留的审查边界：

- 纹理和 environment 转发 registry 是模块级，目前只支持已验证的单 Canvas owner。多 renderer／多 Canvas 的环境隔离需另做 renderer scope，不能从本轮推定成立。
- `splitShelterGlazing` 两个输出保留原 clone 全属性，未压缩 unused vertices，bounds 也包含未引用顶点；这是可避免的一次性 buffer／包围体冗余，当前不是泄漏证据，未在本补丁中改几何打包。
- 单亭玻璃沿用 `sortObjects=false`；有限 grazing／rear 图和源测试不代表与其他透明物／水面在连续移动时的排序保证。

补丁拥有路径仅为 `WorldFacilitySurface.ts`、`WorldPark.tsx`、`surfaces.test.mjs`、本文件及更新后的 `OWNED-PATHS.txt`。不占用自然线重型窗口，不操作 4341。
