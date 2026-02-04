import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Agent } from "@/lib/types";
import { X } from "lucide-react";

interface RevokeModalProps {
  agent: Agent;
  onClose: () => void;
  onRevoke: () => void;
}

export function RevokeModal({ agent, onClose, onRevoke }: RevokeModalProps) {
  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <Card className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden">
        <CardHeader className="shrink-0 border-b">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">Revoke access to {agent.identity.name}</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <p>Are you sure you want to revoke this agent&apos;s access?</p>
          <p>This will remove the session key on-chain.</p>

          <div className="mt-4 flex justify-end gap-3">
            <Button variant="outline" tabIndex={0} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onRevoke}>
              Revoke
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
