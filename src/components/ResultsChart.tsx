import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { formatPercent } from '../lib/format'
import type { SurveyResults } from '../lib/types'

type ResultChoice = SurveyResults['questions'][number]['choices'][number]

/**
 * Horizontal bars, each labelled with its count and percentage (UI.md §9).
 * The same numbers are listed as text next to it, so the chart is hidden from
 * screen readers to avoid reading everything twice.
 */
export default function ResultsChart({ choices }: { choices: ResultChoice[] }) {
  const data = choices.map((choice) => ({
    name: choice.choice_text,
    count: choice.count,
    label: `${choice.count} · ${formatPercent(choice.percentage)}`,
  }))

  return (
    <div aria-hidden="true" style={{ height: data.length * 48 + 16 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 96, bottom: 8, left: 8 }}>
          <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#334155', fontSize: 14 }}
          />
          <Bar dataKey="count" fill="#334155" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="label" position="right" fill="#0f172a" fontSize={14} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
