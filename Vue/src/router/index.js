import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import DeviceDetail from '../views/DeviceDetail.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    {
      path: '/devices/:deviceId',
      name: 'device-detail',
      component: DeviceDetail,
      props: true,
    },
  ],
})

