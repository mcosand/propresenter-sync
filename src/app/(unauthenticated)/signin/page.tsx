import logo from '@/../public/logo.svg';
import { Logo } from '@/components/logo';
import { SignInForm } from '@/components/sign-in-form';

export default function SignInPage() {
  return (
    <main aria-label='Sign in page'>
      <Logo src={logo} />
      <h1>BUMC ProPresenter Sync</h1>
      <SignInForm />
    </main>
  );
}
