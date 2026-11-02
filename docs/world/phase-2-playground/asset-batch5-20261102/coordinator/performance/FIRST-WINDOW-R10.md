# R10 首窗独立核对

同意保留首窗，仅将执行器完成检测改为精确literal saved／直接UI读取，继续原定剩余五窗。不能重采首窗、增加第七窗，或改QA、serve、冻结包和有效性门槛。审计收据：`first-window-audit-r10.json`，42项核对通过。

`runtime/r10-old-a-legacy-camp-sample-1.json` 有300个唯一且连续render frame，1959至2258；首采样帧距settled帧91，符合跳过90帧后测量。settle为10,010.3ms、记录连续稳定599帧，before／after正常可见落地、always、非shot／seat，Balanced／Clear／正午720、固定时间、CSS及buffer1710×931、DPR1。相机参数匹配；全窗相机和角色最大位移均0m，shadow pending全false，calls／triangles／geometries／textures／programs恒定162／621902／252／84／183。legacy候选根缺席且无fallback，QA和serve哈希与冻结协议相同。

独立重算59.4059406FPS，p50／p95为16.7／17.4ms，max57ms，>33.4ms一帧；与raw summary一致。57ms帧不能剔除。该单窗不证明候选性能通过或回归。

`executor-wait-note-r10.json` 将55秒超时限定为已保存后的regex等待未返回，直接UI已经显示saved，未重采、未启动其余窗口，随后暂停。当前只有这一份R10性能raw，没有failed raw。raw本身没有中断／无效标志，故不将执行器等待失败等同于采样无效。直接UI状态和暂停操作由执行方收据证明，本session未重演浏览器操作。

接续顺序固定：旧A街道、新营地、新街道、旧B营地、旧B街道。完成检测必须核对当前预期run／mode／地点的已保存文件名，避免把前一窗的saved文本误认作本窗完成；这只影响执行器等待，不改测量夹具。后续任一数据窗口无效仍立即停止。

保留首窗后的暂停、等待和独立审阅间隔；因此最后仍是存在宿主／时间漂移的顺序ABA，不能声称紧密连续、随机化或热状态受控。settle的599帧是夹具记录值，未另存完整settle流；其门槛由未改动的冻结QA执行。最终须核对同点三窗及旧A/B漂移后再给性能结论。
