<template>
  <div class="container">
    <nav class="top-nav">
      <RouterLink class="nav-link" to="/rag-chat">RAG Chat</RouterLink>
      <RouterLink class="nav-link" to="/career-agent">Career Agent</RouterLink>
    </nav>

    <RouterView />
  </div>
</template>

<style>
body {
  margin: 0;
  background: #f3f6fb;
  font-family: Arial;
}

* {
  box-sizing: border-box;
}

.container {
  width: min(1400px, calc(100% - 40px));
  margin: 20px auto;
}

.top-nav {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 40px;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  background: #fff;
  color: #303133;
  text-decoration: none;
  cursor: pointer;
}

.nav-link.router-link-active {
  border-color: #1677ff;
  background: #1677ff;
  color: #fff;
}
</style>
