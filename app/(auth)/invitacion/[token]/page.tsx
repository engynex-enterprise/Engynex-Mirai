import { Suspense } from "react"
import { AuthSkeleton } from "@/components/auth/auth-skeleton"
import { AcceptInvitation } from "@/features/household/accept-invitation"
import { getInvitationInfo } from "@/features/household/query"

export const metadata = { title: "Invitación" }

async function Inner({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <AcceptInvitation token={token} info={await getInvitationInfo(token)} />
}

export default function Page(props: PageProps<"/invitacion/[token]">) {
  return <Suspense fallback={<AuthSkeleton />}><Inner params={props.params} /></Suspense>
}
