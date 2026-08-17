import { initializeApp } from 'firebase/app'
import {
  EmailAuthProvider,
  getAuth,
  inMemoryPersistence,
  reauthenticateWithCredential,
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

const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
const persistenceReady = setPersistence(auth, inMemoryPersistence)
const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function loadAthenaAccount(user) {
  const token = await user.getIdToken()
  const response = await fetch(`${configuredApiBase}/account`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Athena could not load this account.')
  return data.account
}

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
  const normalizedUsername = username.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalizedUsername)) {
    throw new Error('The username or password is incorrect.')
  }
  try {
    await persistenceReady
    const credential = await signInWithEmailAndPassword(auth, `${normalizedUsername}@athena.invalid`, password)
    const account = await loadAthenaAccount(credential.user)
    return { credential, account }
  } catch (error) {
    if (auth.currentUser) await signOut(auth).catch(() => {})
    throw new Error(friendlyAuthError(error))
  }
}

export async function refreshAthenaAccount() {
  if (!auth.currentUser) throw new Error('Your Athena session has expired. Sign in again.')
  return loadAthenaAccount(auth.currentUser)
}

export async function logoutFromAthena() {
  await signOut(auth)
}

export async function changeAthenaPassword(currentPassword, newPassword) {
  if (!auth.currentUser) throw new Error('Your Athena session has expired. Sign in again.')
  try {
    if (!currentPassword) throw new Error('Enter your current password to confirm this change.')
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword)
    await reauthenticateWithCredential(auth.currentUser, credential)
    await updatePassword(auth.currentUser, newPassword)
    await auth.currentUser.getIdToken(true)
  } catch (error) {
    if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') {
      throw new Error('The current password is incorrect.')
    }
    throw new Error(friendlyAuthError(error))
  }
}

export async function unlockAthenaOwnerCenter(password) {
  const user = auth.currentUser
  if (!user || String(user.email || '').toLowerCase() !== 'swipingcc@athena.invalid') {
    throw new Error('Owner Center is available only to Athena\'s owner.')
  }
  try {
    const credential = EmailAuthProvider.credential(user.email, password)
    await reauthenticateWithCredential(user, credential)
    await user.getIdToken(true)
  } catch (error) {
    if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') {
      throw new Error('The owner password is incorrect.')
    }
    throw new Error(friendlyAuthError(error))
  }
}

export async function getAthenaIdToken() {
  return auth.currentUser ? auth.currentUser.getIdToken() : null
}
