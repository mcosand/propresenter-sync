'use client';

import { useActionState } from "react";
import { useFormStatus } from 'react-dom';
import { signInAction } from '@/services/msEntraId';

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}>
      {pending ? 'Signing in...' : 'Sign in to SharePoint'}
    </button>
  );
}

export function SignInForm() {
  const [errorMessage, signIn] = useActionState(signInAction, undefined);

  return (
    <form action={signIn}>
      <SignInButton />
      {errorMessage && (
        <p role='alert' className='text-red-500 pt-3'>
          {errorMessage}
        </p>
      )}
    </form>
  );
}
