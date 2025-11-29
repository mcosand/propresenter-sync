import dynamic from 'next/dynamic'
 
const DownstreamGuard = dynamic(
  () => import('./implementation'),
  { ssr: false }
)

export default DownstreamGuard;