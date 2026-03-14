import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './ApiLogsView.css';

interface ApiCallLog {
  id: number;
  request_timestamp: string;
  response_timestamp: string | null;
  endpoint: string;
  model: string;
  request_type: string;
  request_messages: string;
  request_temperature: number | null;
  request_max_tokens: number | null;
  response_text: string | null;
  response_status: string;
  error_message: string | null;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  screenshot_count: number;
  created_at: string;
}

interface ApiCallStats {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  total_tokens: number;
  total_screenshots: number;
  average_duration_ms: number;
}

const ApiLogsView: React.FC = () => {
  const PAGE_SIZE = 25;

  const [logs, setLogs] = useState<ApiCallLog[]>([]);
  const [stats, setStats] = useState<ApiCallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'screenshot_analysis' | 'daily_summary'>('all');
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ApiCallLog | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [logsData, statsData] = await Promise.all([
        invoke<ApiCallLog[]>('get_api_call_logs', {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          requestType: filter === 'all' ? undefined : filter,
        }),
        invoke<ApiCallStats>('get_api_call_stats'),
      ]);
      setLogs(logsData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load API logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter, page]);

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    setPage(0);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    return `${ms}ms`;
  };

  const getStatusIcon = (status: string) => {
    return status === 'success' ? '✅' : '❌';
  };

  const getStatusColor = (status: string) => {
    return status === 'success' ? 'text-green-600' : 'text-red-600';
  };

  const extractScreenshots = (requestMessages: string): string[] => {
    if (!requestMessages || requestMessages.trim() === '') return [];

    try {
      const messages = JSON.parse(requestMessages);
      const screenshots: string[] = [];

      // Parse message structure to find image URLs
      for (const message of messages) {
        if (message.content && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'image_url' && part.image_url && part.image_url.url) {
              screenshots.push(part.image_url.url);
            }
          }
        }
      }

      return screenshots;
    } catch (error) {
      console.error('Failed to parse request messages:', error);
      return [];
    }
  };

  const downloadJSON = (data: any, filename: string) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportRequest = (log: ApiCallLog) => {
    const requestData = {
      timestamp: log.request_timestamp,
      type: log.request_type,
      model: log.model,
      endpoint: log.endpoint,
      temperature: log.request_temperature,
      max_tokens: log.request_max_tokens,
      messages: log.request_messages ? JSON.parse(log.request_messages) : null,
    };
    downloadJSON(requestData, `request-${log.id}-${new Date(log.request_timestamp).getTime()}.json`);
  };

  const exportResponse = (log: ApiCallLog) => {
    const responseData = {
      timestamp: log.response_timestamp,
      status: log.response_status,
      duration_ms: log.duration_ms,
      response_text: log.response_text,
      error_message: log.error_message,
      tokens: {
        prompt: log.prompt_tokens,
        completion: log.completion_tokens,
        total: log.total_tokens,
      },
    };
    downloadJSON(responseData, `response-${log.id}-${new Date(log.request_timestamp).getTime()}.json`);
  };

  return (
    <div className="api-logs-view">
      <div className="header">
        <h1>🔍 API Call Logs & Debugging</h1>
        <button onClick={loadData} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>

      {/* Statistics Section */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Calls</div>
            <div className="stat-value">{stats.total_calls}</div>
          </div>
          <div className="stat-card success">
            <div className="stat-label">Successful</div>
            <div className="stat-value">
              {stats.successful_calls}
              <span className="stat-percentage">
                {stats.total_calls > 0
                  ? ` (${((stats.successful_calls / stats.total_calls) * 100).toFixed(1)}%)`
                  : ''}
              </span>
            </div>
          </div>
          <div className="stat-card error">
            <div className="stat-label">Failed</div>
            <div className="stat-value">{stats.failed_calls}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Tokens</div>
            <div className="stat-value">{stats.total_tokens.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Screenshots Analyzed</div>
            <div className="stat-value">{stats.total_screenshots}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Duration</div>
            <div className="stat-value">{stats.average_duration_ms.toFixed(0)}ms</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label>Type:</label>
          <select value={filter} onChange={(e) => handleFilterChange(e.target.value as typeof filter)}>
            <option value="all">All</option>
            <option value="screenshot_analysis">Screenshot Analysis</option>
            <option value="daily_summary">Daily Summary</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="loading">Loading logs...</div>
      ) : (
        <div className="logs-container">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Type</th>
                <th>Model</th>
                <th>Timestamp</th>
                <th>Duration</th>
                <th>Tokens</th>
                <th>Screenshots</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className={log.response_status !== 'success' ? 'error-row' : ''}>
                  <td className="status-cell">
                    <span className={getStatusColor(log.response_status)}>
                      {getStatusIcon(log.response_status)}
                    </span>
                  </td>
                  <td className="type-cell">{log.request_type}</td>
                  <td className="model-cell">{log.model}</td>
                  <td className="timestamp-cell">{formatTimestamp(log.request_timestamp)}</td>
                  <td className="duration-cell">{formatDuration(log.duration_ms)}</td>
                  <td className="tokens-cell">{log.total_tokens || 'N/A'}</td>
                  <td className="screenshots-cell">{log.screenshot_count}</td>
                  <td className="actions-cell">
                    <button onClick={() => setSelectedLog(log)} className="details-btn">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="page-btn"
            >
              Previous
            </button>
            <span className="page-info">Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={logs.length < PAGE_SIZE}
              className="page-btn"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>API Call Details #{selectedLog.id}</h2>
              <button onClick={() => setSelectedLog(null)} className="close-btn">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <h3>Request Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <strong>Timestamp:</strong> {formatTimestamp(selectedLog.request_timestamp)}
                  </div>
                  <div className="detail-item">
                    <strong>Type:</strong> {selectedLog.request_type}
                  </div>
                  <div className="detail-item">
                    <strong>Model:</strong> {selectedLog.model}
                  </div>
                  <div className="detail-item">
                    <strong>Endpoint:</strong> {selectedLog.endpoint}
                  </div>
                  <div className="detail-item">
                    <strong>Temperature:</strong> {selectedLog.request_temperature}
                  </div>
                  <div className="detail-item">
                    <strong>Max Tokens:</strong> {selectedLog.request_max_tokens}
                  </div>
                  <div className="detail-item">
                    <strong>Screenshots:</strong> {selectedLog.screenshot_count}
                  </div>
                </div>
              </div>

              {/* Export Buttons */}
              <div className="detail-section">
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => exportRequest(selectedLog)}
                    className="export-btn"
                    disabled={!selectedLog.request_messages || selectedLog.request_messages.trim() === ''}
                  >
                    📥 Export Request JSON
                  </button>
                  <button
                    onClick={() => exportResponse(selectedLog)}
                    className="export-btn"
                  >
                    📤 Export Response JSON
                  </button>
                </div>
              </div>

              {/* Screenshots Section */}
              {(() => {
                const screenshots = extractScreenshots(selectedLog.request_messages);
                return screenshots.length > 0 ? (
                  <div className="detail-section">
                    <h3>Screenshots ({screenshots.length})</h3>
                    <div className="screenshots-grid">
                      {screenshots.map((screenshot, index) => (
                        <div
                          key={index}
                          className="screenshot-thumbnail"
                          onClick={() => setExpandedImage(screenshot)}
                        >
                          <img
                            src={screenshot}
                            alt={`Screenshot ${index + 1}`}
                            loading="lazy"
                          />
                          <div className="thumbnail-overlay">
                            🔍 Click to expand
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedLog.request_messages && selectedLog.request_messages.trim() !== '' ? (
                  <div className="detail-section">
                    <h3>Request Messages</h3>
                    <div className="info-message">
                      ℹ️ Request data available but no screenshots found (text-only request)
                    </div>
                  </div>
                ) : (
                  <div className="detail-section">
                    <h3>Request Messages</h3>
                    <div className="info-message">
                      ℹ️ No request data stored (Debug Mode was disabled when this request was made)
                    </div>
                  </div>
                );
              })()}

              <div className="detail-section">
                <h3>Response Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <strong>Status:</strong>{' '}
                    <span className={getStatusColor(selectedLog.response_status)}>
                      {selectedLog.response_status}
                    </span>
                  </div>
                  <div className="detail-item">
                    <strong>Duration:</strong> {formatDuration(selectedLog.duration_ms)}
                  </div>
                  <div className="detail-item">
                    <strong>Prompt Tokens:</strong> {selectedLog.prompt_tokens || 'N/A'}
                  </div>
                  <div className="detail-item">
                    <strong>Completion Tokens:</strong> {selectedLog.completion_tokens || 'N/A'}
                  </div>
                  <div className="detail-item">
                    <strong>Total Tokens:</strong> {selectedLog.total_tokens || 'N/A'}
                  </div>
                </div>
              </div>

              {selectedLog.error_message && (
                <div className="detail-section error-section">
                  <h3>Error Message</h3>
                  <div className="error-message">{selectedLog.error_message}</div>
                </div>
              )}

              {selectedLog.response_text && (
                <div className="detail-section">
                  <h3>Response Text</h3>
                  <div className="response-text">{selectedLog.response_text}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {expandedImage && (
        <div className="lightbox-overlay" onClick={() => setExpandedImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setExpandedImage(null)} className="lightbox-close-btn">
              ✕
            </button>
            <img src={expandedImage} alt="Expanded screenshot" className="lightbox-image" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiLogsView;
