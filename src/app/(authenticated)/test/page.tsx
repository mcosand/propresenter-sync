"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function() {
  const [ state, setState ] = useState();
  const clientSession = useSession();

  useEffect(() => {
    fetch('/api/sharepoint').then(f => f.json()).then(setState).catch(console.error);
  }, [])
  return (
  <div>
    <div style={{marginBottom:'2em'}}>server {JSON.stringify(state, null, 2)}</div>
    <div>client {JSON.stringify(clientSession, null, 2)}</div>
  </div>);
}