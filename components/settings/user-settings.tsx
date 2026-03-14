import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function UserSettings() {
  const users = [
    { id: 1, name: "Admin", email: "admin@shop.com", role: "Admin", status: "Active" },
    { id: 2, name: "Manager", email: "manager@shop.com", role: "Manager", status: "Active" },
    { id: 3, name: "Cashier", email: "cashier@shop.com", role: "Cashier", status: "Inactive" },
  ]

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between mb-4">
          <h2 className="font-semibold text-lg">User Management</h2>
          <Button className="bg-green-600 hover:bg-green-700">Add User</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Role</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{user.name}</td>
                  <td className="p-2">{user.email}</td>
                  <td className="p-2">{user.role}</td>
                  <td className="p-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        user.status === "Active"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="p-2">
                    <button className="text-blue-600 hover:underline text-xs">Edit</button>
                    <span className="mx-2">|</span>
                    <button className="text-red-600 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
