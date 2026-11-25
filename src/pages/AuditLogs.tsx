import React, { useState, useEffect } from 'react';
import { auditService } from '@/services/api';
import { AuditLog } from '@/types';
import { Card, Input, Badge, EmptyState, PageHeader, Toolbar, Skeleton } from '@/components/common';
import { formatDate } from '@/utils/formatters';
import { ScrollText, ShieldAlert, ShieldCheck, Search } from 'lucide-react';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredLogs = logs.filter(log => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        log.entity_type.toLowerCase().includes(q) ||
        (log.entity_id && log.entity_id.toLowerCase().includes(q)) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Audit & Security Logs"
        subtitle="Immutable traceability log for invoice generation, stock operations, and access events."
      />

      <Toolbar>
        <div className="w-full">
          <Input
            placeholder="Search audit events by action, entity type, ID or payload..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
      </Toolbar>

      <Card className="bg-white overflow-hidden" noPadding>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
            <Skeleton height={42} className="w-full" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<ShieldCheck className="w-8 h-8 text-emerald-600" />}
              title="No audit events logged"
              description="Critical system operations will be traced and logged here automatically."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-charcoal-200 bg-cream-50 text-charcoal-600 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-3">Action</th>
                  <th className="py-3 px-3">Entity Type</th>
                  <th className="py-3 px-3 font-mono">Entity ID</th>
                  <th className="py-3 px-3">Payload Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100 font-mono text-[11px]">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-cream-50/60 transition-colors">
                    <td className="py-3 px-4 text-charcoal-600">
                      {formatDate(log.created_at)}
                    </td>

                    <td className="py-3 px-3">
                      <Badge variant="brand" size="sm" className="font-bold uppercase">
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
