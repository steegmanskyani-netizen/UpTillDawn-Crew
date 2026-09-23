import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Ban } from "lucide-react"

export default function DisabledPage() {
  return <Card className="w-full max-w-md rounded-2xl border-border shadow-lg">
    <CardHeader className="items-center space-y-4 pb-2">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Ban className="h-8 w-8 text-muted-foreground"/></div>
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-bold text-foreground">Account niet actief</h1>
        <p className="text-sm text-muted-foreground">Dit account heeft momenteel geen toegang tot Uptilldawn Crew. Neem contact op met een administrator als dit niet klopt.</p>
      </div>
    </CardHeader>
    <CardContent className="pt-2">
      <Button variant="outline" className="h-11 w-full rounded-xl" asChild><Link href="/login">Ander account gebruiken</Link></Button>
    </CardContent>
  </Card>
}
