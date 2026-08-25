import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import MovieApi from '@/store/API/MovieApi'
import { authSlice, loginSuccess, logout } from '@/store/Slice/authSlice'
import authApi from '@/store/API/authApi'
import reviewApi from '@/store/API/reviewApi'
import favoriteApi from '@/store/API/favoriteApi'
import vercelApi from '@/store/API/vercelApi'
import analyticsApi from '@/store/API/analyticsApi'
import adminApi from '@/store/API/adminApi'

const USER_SCOPED_APIS = [reviewApi, favoriteApi, analyticsApi, vercelApi, adminApi]

function resetUserScopedApis(dispatch) {
  USER_SCOPED_APIS.forEach((api) => {
    dispatch(api.util.resetApiState())
  })
}

const sessionCacheListener = createListenerMiddleware()

sessionCacheListener.startListening({
  actionCreator: logout,
  effect: (_, listenerApi) => {
    resetUserScopedApis(listenerApi.dispatch)
  },
})

sessionCacheListener.startListening({
  actionCreator: loginSuccess,
  effect: (action, listenerApi) => {
    const prevUserId = listenerApi.getOriginalState().auth.userInfo?.id
    const nextUserId = action.payload.userInfo?.id
    if (prevUserId != null && nextUserId != null && prevUserId !== nextUserId) {
      resetUserScopedApis(listenerApi.dispatch)
    }
  },
})

const store = configureStore({
  reducer: {
    [MovieApi.reducerPath]: MovieApi.reducer,
    [authApi.reducerPath]: authApi.reducer,
    [reviewApi.reducerPath]: reviewApi.reducer,
    [favoriteApi.reducerPath]: favoriteApi.reducer,
    [vercelApi.reducerPath]: vercelApi.reducer,
    [analyticsApi.reducerPath]: analyticsApi.reducer,
    [adminApi.reducerPath]: adminApi.reducer,
    auth: authSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .prepend(sessionCacheListener.middleware)
      .concat(
        MovieApi.middleware,
        authApi.middleware,
        reviewApi.middleware,
        favoriteApi.middleware,
        vercelApi.middleware,
        analyticsApi.middleware,
        adminApi.middleware
      ),
})
setupListeners(store.dispatch)
export default store
