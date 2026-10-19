import {Suspense} from "react"
import {StudentAttemptReview} from "@/components/student/student-review"

export default function StudentReviewPage() {
  return <Suspense fallback={<p role="status" className="p-6">Загружаем разбор…</p>}><StudentAttemptReview/></Suspense>
}
