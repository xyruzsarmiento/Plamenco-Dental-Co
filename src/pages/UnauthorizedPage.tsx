import { ArrowLeft, KeyRound, LogOut, ShieldAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'

export function UnauthorizedPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const isPendingInternalInvite = Boolean(user && user.role !== 'patient' && user.status === 'inactive')

  async function switchAccount() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <section className="page-stack">
      <div className="access-panel" role="status" aria-labelledby="unauthorized-title">
        <div className="brand-mark" aria-hidden="true">
          <ShieldAlert size={22} />
        </div>
        <div>
          <p className="eyebrow">{isPendingInternalInvite ? 'Account setup required' : 'Access restricted'}</p>
          <h2 id="unauthorized-title">{isPendingInternalInvite ? 'Finish your clinic invitation first' : 'You do not have permission to open this area'}</h2>
          <p>{isPendingInternalInvite
            ? 'Your invitation session is valid, but this clinic account is still inactive. Complete the invitation setup before entering an internal workspace.'
            : 'Your account is signed in, but this workspace requires a role or permission that has not been assigned to you.'}</p>
        </div>
        {isPendingInternalInvite ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link to="/accept-invite"><Button icon={<KeyRound size={16} />}>Finish account setup</Button></Link>
            <Button variant="secondary" icon={<LogOut size={16} />} onClick={() => void switchAccount()}>Use a different account</Button>
          </div>
        ) : (
          <Link to="/app">
            <Button variant="secondary" icon={<ArrowLeft size={16} />}>Return to dashboard</Button>
          </Link>
        )}
      </div>
    </section>
  )
}