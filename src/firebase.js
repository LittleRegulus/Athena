import { initializeApp } from 'firebase/app'
import {
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyBxXxBQsgY7n-YYxWJhgg7wYs2LYlm11So',
  authDomain: 'athena-3dd48.firebaseapp.com',
  projectId: 'athena-3dd48',
  storageBucket: 'athena-3dd48.firebasestorage.app',
  messagingSenderId: '587573361379',
  appId: '1:587573361379:web:f3a83e586f67fdc39ee3d6',
}

export const ATHENA_USERNAME = 'swipingcc'
const ATHENA_LOGIN_EMAIL = import.meta.env.VITE_ATHENA_LOGIN_EMAIL || 'swipingcc@athena.invalid'

const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
const persistenceReady = setPersistence(auth, inMemoryPersistence)

function friendlyAuthError(error) {
  const code = error?.code || ''
  if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
    return 'The username or password is incorrect.'
  }
  if (code === 'auth/too-many-requests') return 'Too many login attempts. Wait a moment, then try again.'
  if (code === 'auth/network-request-failed') return 'Athena could not reach Firebase. Check your connection and try again.'
  if (code === 'auth/operation-not-allowed') return 'Email/password login is not enabled for the Athena Firebase project yet.'
  if (code === 'auth/unauthorized-domain') return 'This site must be added to Firebase Authentication authorized domains.'
  if (code === 'auth/requires-recent-login') return 'Log out and sign in again before changing the password.'
  return error?.message || 'Athena could not complete authentication.'
}

export async function loginToAthena(username, password) {
  if (username.trim().toLowerCase() !== ATHENA_USERNAME) throw new Error('The username or password is incorrect.')
  try {
    await persistenceReady
    return await signInWithEmailAndPassword(auth, ATHENA_LOGIN_EMAIL, password)
  } catch (error) {
    throw new Error(friendlyAuthError(error))
  }
}

export async function logoutFromAthena() {
  await signOut(auth)
}

export async function changeAthenaPassword(newPassword) {
  if (!auth.currentUser) throw new Error('Your Athena session has expired. Sign in again.')
  try {
    await updatePassword(auth.currentUser, newPassword)
  } catch (error) {
    throw new Error(friendlyAuthError(error))
  }
}

export async function getAthenaIdToken() {
  return auth.currentUser ? auth.currentUser.getIdToken() : null
}

