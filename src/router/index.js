import { createRouter, createWebHistory } from 'vue-router'
import RagChatView from '../views/RagChatView.vue'
import CareerAgent from '../views/CareerAgent.vue'
import TopicAdminView from '../views/TopicAdminView.vue'

const routes = [
  {
    path: '/',
    redirect: '/rag-chat',
  },
  {
    path: '/rag-chat',
    name: 'rag-chat',
    component: RagChatView,
  },
  {
    path: '/career-agent',
    name: 'career-agent',
    component: CareerAgent,
  },
  {
    path: '/topic-admin',
    name: 'topic-admin',
    component: TopicAdminView,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
