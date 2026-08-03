import { createRouter, createWebHistory } from 'vue-router';
import TasksView from '@/views/TasksView.vue';
import AgentsView from '@/views/AgentsView.vue';
import GoalsView from '@/views/GoalsView.vue';
import TeamsView from '@/views/TeamsView.vue';
import ActivityView from '@/views/ActivityView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/tasks',
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: TasksView,
    },
    {
      path: '/agents',
      name: 'agents',
      component: AgentsView,
    },
    {
      path: '/goals',
      name: 'goals',
      component: GoalsView,
    },
    {
      path: '/teams',
      name: 'teams',
      component: TeamsView,
    },
    {
      path: '/activity',
      name: 'activity',
      component: ActivityView,
    },
  ],
});

export default router;
