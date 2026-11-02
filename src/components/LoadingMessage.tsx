export default function LoadingMessage({ text }: { text: string }) {
  return (
    <p role="status" className="p-8 text-center text-lg text-slate-600">
      {text}
    </p>
  )
}
