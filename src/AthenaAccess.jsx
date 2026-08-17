import { useEffect, useRef, useState } from 'react'
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import athenaIcon from '../AthenaIcon.png'
import {
  changeAthenaPassword,
  loginToAthena,
  logoutFromAthena,
  refreshAthenaAccount,
  unlockAthenaOwnerCenter,
} from './firebase.js'
import {
  lockSecureStorage,
  rewrapSecureStorage,
  unlockSecureStorage,
} from './secureStorage.js'

function SplashScreen({ onComplete }) {
  const [leaving, setLeaving] = useState(false)
  const [dots, setDots] = useState(1)
  const durationRef = useRef(4000 + Math.floor(Math.random() * 2001))

  useEffect(() => {
    const duration = durationRef.current
    const dotsTimer = window.setInterval(() => setDots((count) => (count % 3) + 1), 420)
    const leaveTimer = window.setTimeout(() => setLeaving(true), Math.max(0, duration - 350))
    const doneTimer = window.setTimeout(onComplete, duration)
    return () => {
      window.clearInterval(dotsTimer)
      window.clearTimeout(leaveTimer)
      window.clearTimeout(doneTimer)
    }
  }, [onComplete])

  return (
    <div
      className={`splash-screen ${leaving ? 'splash-screen--leaving' : ''}`}
      style={{ '--splash-duration': `${durationRef.current}ms` }}
      role="status"
      aria-live="polite"
      aria-label="Loading Athena"
    >
      <div className="splash-glow" aria-hidden="true" />
      <div className="splash-content">
        <img src={athenaIcon} alt="Athena" />
        <div className="splash-progress" aria-hidden="true"><span /></div>
        <p>Loading private assets<span className="splash-dots">{'.'.repeat(dots)}</span></p>
      </div>
      <div className="splash-classification"><LockKeyhole size={11} /> Private access environment</div>
    </div>
  )
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!username.trim() || !password) return
    setSubmitting(true)
    setError('')
    try {
      await onLogin(username, password)
    } catch (loginError) {
      setError(loginError.message)
      setSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-glow" aria-hidden="true" />
      <section className="login-panel" aria-labelledby="login-title">
        <img className="login-logo" src={athenaIcon} alt="" />
        <p className="eyebrow">Private access</p>
        <h1 id="login-title">Enter Athena</h1>
        <p className="login-intro">Sign in to unlock the encrypted Athena vault on this device.</p>

        <form onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Username</span>
            <div><UserRound size={16} /><input value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" /></div>
          </label>
          <label className="login-field">
            <span>Password</span>
            <div><LockKeyhole size={16} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></div>
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={submitting || !username.trim() || !password}>
            {submitting ? 'Unlocking...' : 'Unlock Athena'} <ArrowRight size={16} />
          </button>
        </form>

        <p className="login-security"><ShieldCheck size={13} /> Your password is verified by Firebase and is never stored in this app.</p>
      </section>
    </main>
  )
}

export default function AthenaAccess({ children }) {
  const [stage, setStage] = useState('splash')
  const [currentAccount, setCurrentAccount] = useState(null)

  async function handleLogin(username, password) {
    const { credential, account } = await loginToAthena(username, password)
    try {
      await unlockSecureStorage(password, credential.user.uid)
      setCurrentAccount(account)
      setStage('app')
    } catch (error) {
      await logoutFromAthena().catch(() => {})
      throw error
    }
  }

  async function handleLogout() {
    await lockSecureStorage()
    await logoutFromAthena()
    setCurrentAccount(null)
    setStage('login')
  }

  async function handlePasswordChange(currentPassword, newPassword) {
    await changeAthenaPassword(currentPassword, newPassword)
    await rewrapSecureStorage(newPassword)
  }

  async function handleOwnerCenterUnlock(password) {
    await unlockAthenaOwnerCenter(password)
  }

  async function handleAccountRefresh() {
    const account = await refreshAthenaAccount()
    setCurrentAccount(account)
    return account
  }

  if (stage === 'splash') return <SplashScreen onComplete={() => setStage('login')} />
  if (stage === 'login') return <LoginScreen onLogin={handleLogin} />
  return children({
    currentUsername: currentAccount.username,
    currentRole: currentAccount.role,
    currentRoleTone: currentAccount.roleTone,
    canViewVeniceBalance: currentAccount.canViewVeniceBalance,
    isOwner: currentAccount.isOwner,
    isAdmin: currentAccount.isAdmin,
    accountTier: currentAccount.tier,
    accountPlanLabel: currentAccount.planLabel,
    accountUsage: currentAccount.usage,
    allowedModelIds: currentAccount.allowedModelIds,
    onLogout: handleLogout,
    onChangePassword: handlePasswordChange,
    onUnlockOwnerCenter: handleOwnerCenterUnlock,
    onRefreshAccount: handleAccountRefresh,
  })
}
