# 退税 ZIP 直接依赖变更

目标：完整共享资料包 ZIP 导出。使用现有安装的 fflate 0.8.3，MIT；不新增服务、不改变许可证、不升级其他依赖、不运行安装生命周期脚本。

实际核实：node_modules/fflate/package.json 的 version=0.8.3；LICENSE 为 MIT。该版本当前已在 package-lock 的 node_modules/fflate 中，作为间接依赖使用。

待执行的精确变更：

```diff
--- package.json dependencies
+++ package.json dependencies
+ "fflate": "0.8.3",
--- package-lock.json packages[""].dependencies
+++ package-lock.json packages[""].dependencies
+ "fflate": "0.8.3",
```

只提升为固定直接依赖，保留现有 fflate 锁定版本、integrity 和其他依赖条目，不调用付费API。批准后才修改这两项并从服务端ZIP模块导入；未批准期间继续其他模块和资料包权限/文件上限实现，不从隐式间接依赖导入。

恢复：如不采用该依赖，移除新增的两个根依赖声明，保留原锁文件中的既有间接依赖；ZIP模块不能保留未声明的导入。新业务资料和云端SQL不受这项依赖声明恢复影响。
