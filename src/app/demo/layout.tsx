import {redirect} from 'next/navigation';
// Historical routes remain only to preserve test fixtures. The supported UI is /workspace.
export default function LegacyDemoLayout(){redirect('/workspace');}
