"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const dailySales = [
  { date: "Mon", amount: 8500 },
  { date: "Tue", amount: 7200 },
  { date: "Wed", amount: 9500 },
  { date: "Thu", amount: 11000 },
  { date: "Fri", amount: 6800 },
  { date: "Sat", amount: 15000 },
  { date: "Sun", amount: 12400 },
]

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Reports & Analytics</h1>

      {/* REPORT FILTERS */}
      <Card>
        <CardContent className="p-5 flex gap-4">
          <Input type="date" placeholder="Start Date" />
          <Input type="date" placeholder="End Date" />
          <Button className="bg-green-600 hover:bg-green-700">Generate Report</Button>
          <Button variant="outline">Export Excel</Button>
        </CardContent>
      </Card>

      {/* REPORT CARDS */}
      <div className="grid grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-5">
            <p className="text-gray-500 text-sm">Total Sales</p>
            <h2 className="text-2xl font-bold">₹84,200</h2>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-gray-500 text-sm">Total Bills</p>
            <h2 className="text-2xl font-bold">148</h2>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-gray-500 text-sm">Credit Sales</p>
            <h2 className="text-2xl font-bold">₹12,000</h2>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-gray-500 text-sm">GST Collected</p>
            <h2 className="text-2xl font-bold">₹4,500</h2>
          </CardContent>
        </Card>
      </div>

      {/* SALES TABLE */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold mb-4">Daily Sales Report</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Sales Amount</th>
                </tr>
              </thead>

              <tbody>
                {(dailySales || []).map((sale, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-2">{sale.date}</td>
                    <td className="p-2">₹{sale.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
