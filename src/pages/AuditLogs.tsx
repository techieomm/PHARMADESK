import React, { useState, useEffect } from 'react';
import { auditService } from '@/services/api';
import { AuditLog } from '@/types';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate } from '@/utils/formatters';
import { ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      try {
        const data = await auditService.getAuditLogs();
        setLogs(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-charcoal-200">
        <div>
          <h1 className="text-xl font-bold text-charcoal-900 tracking-tight flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-brand-600" />
            System Audit & Security Logs
          </h1>
          <p className="text-xs text-charcoal-500 mt-0.5">
            Immutable traceability log for invoice generation, stock operations, and access events.
          </p>
        </div>
      </div>

      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="py-12 text-center text-xs text-charcoal-500">Loading audit records...</div>
        ) : logs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<ShieldCheck className="w-6 h-6 text-emerald-600" />}
              title="No audit events logged"
              description="Critical system operations will be traced and logged here automatically."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity Type</th>
                  <th className="py-2.5 px-3 font-mono">Entity ID</th>
                  <th className="py-2.5 px-3">Payload Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100 font-mono text-[11px]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-cream-50/50">
                    <td className="py-3 px-4 text-charcoal-600">
                      {formatDate(log.created_at)}
                    </td>

                    <td className="py-3 px-3">
                      <Badge variant="brand" className="font-bold text-[10px]">
                        {log.action}
                      </Badge>
                    </td>

                    <td className="py-3 px-3 text-charcoal-800 uppercase font-sans font-medium">
                      {log.entity_type}
                    </td>

                    <td className="py-3 px-3 font-bold text-charcoal-900">
                      {log.entity_id || '-'}
                    </td>

                    <td className="py-3 px-3 text-charcoal-600 font-sans">
                      {log.details ? JSON.stringify(log.details) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
