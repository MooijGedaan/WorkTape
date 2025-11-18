import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';

interface ScreenshotData {
  monitor_id: number;
  monitor_name: string;
  image_base64: string;
  width: number;
  height: number;
  is_primary: boolean;
}

export function ScreenCaptureTestView() {
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureTime, setCaptureTime] = useState<number | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analysisTime, setAnalysisTime] = useState<number | null>(null);

  const handleCapture = async () => {
    setIsCapturing(true);
    setError(null);
    setCaptureTime(null);
    setScreenshots([]);
    setAiAnalysis(null);
    setAnalysisTime(null);

    const startTime = performance.now();

    try {
      const result = await invoke<ScreenshotData[]>('test_screenshot_capture');
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      setScreenshots(result);
      setCaptureTime(duration);
    } catch (err) {
      setError(err as string);
      console.error('Screenshot capture failed:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCaptureAndAnalyze = async () => {
    setIsCapturing(true);
    setIsAnalyzing(true);
    setError(null);
    setCaptureTime(null);
    setScreenshots([]);
    setAiAnalysis(null);
    setAnalysisTime(null);

    const startTime = performance.now();

    try {
      // First capture screenshots to show them
      const screenshotResult = await invoke<ScreenshotData[]>('test_screenshot_capture');
      const captureEndTime = performance.now();
      const captureDuration = Math.round(captureEndTime - startTime);

      setScreenshots(screenshotResult);
      setCaptureTime(captureDuration);
      setIsCapturing(false);

      // Then analyze with AI
      const analysisStartTime = performance.now();
      const analysis = await invoke<string>('capture_and_analyze_screen');
      const analysisEndTime = performance.now();
      const analysisDuration = Math.round(analysisEndTime - analysisStartTime);

      setAiAnalysis(analysis);
      setAnalysisTime(analysisDuration);
    } catch (err) {
      setError(err as string);
      console.error('Screenshot capture or analysis failed:', err);
    } finally {
      setIsCapturing(false);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full">
      <Heading>Screen Capture Testing</Heading>
      <Text className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        Test screenshot capture functionality for all connected monitors
      </Text>

      <div className="mt-8 flex gap-4">
        <Button
          onClick={handleCapture}
          color="zinc"
          disabled={isCapturing || isAnalyzing}
        >
          {isCapturing ? 'Capturing...' : 'Capture Screenshots Only'}
        </Button>
        <Button
          onClick={handleCaptureAndAnalyze}
          color="blue"
          disabled={isCapturing || isAnalyzing}
        >
          {isCapturing ? 'Capturing...' : isAnalyzing ? 'Analyzing with AI...' : 'Capture & Analyze with AI'}
        </Button>
      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/20 dark:ring-red-900">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-400">Error</h3>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {screenshots.length > 0 && (
        <>
          <div className="mt-6 rounded-lg bg-white p-4 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Capture Metadata</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-600 dark:text-zinc-400">Monitors captured:</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">{screenshots.length}</dd>
              </div>
              {captureTime && (
                <div className="flex justify-between">
                  <dt className="text-zinc-600 dark:text-zinc-400">Capture time:</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100">{captureTime}ms</dd>
                </div>
              )}
              {analysisTime && (
                <div className="flex justify-between">
                  <dt className="text-zinc-600 dark:text-zinc-400">AI analysis time:</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100">{analysisTime}ms</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-zinc-600 dark:text-zinc-400">Timestamp:</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {new Date().toLocaleTimeString()}
                </dd>
              </div>
            </dl>
          </div>

          {aiAnalysis && (
            <div className="mt-6 rounded-lg bg-blue-50 p-4 ring-1 ring-blue-200 dark:bg-blue-950/20 dark:ring-blue-900">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">AI Analysis (GPT-4o)</h3>
              <p className="mt-2 text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                {aiAnalysis}
              </p>
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-6 rounded-lg bg-yellow-50 p-4 ring-1 ring-yellow-200 dark:bg-yellow-950/20 dark:ring-yellow-900">
              <h3 className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Analyzing with AI...</h3>
              <p className="mt-2 text-sm text-yellow-800 dark:text-yellow-200">
                Sending screenshots to GPT-4o for analysis. This may take a few seconds...
              </p>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Screenshots Captured
            </h3>
            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
              {screenshots.map((screenshot) => (
                <div
                  key={screenshot.monitor_id}
                  className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {screenshot.monitor_name || `Monitor ${screenshot.monitor_id + 1}`}
                      {screenshot.is_primary && (
                        <span className="ml-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/20 dark:text-blue-400 dark:ring-blue-400/30">
                          Primary
                        </span>
                      )}
                    </h4>
                  </div>

                  <div className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
                    Resolution: {screenshot.width} × {screenshot.height}
                  </div>

                  <div className="relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <img
                      src={`data:image/jpeg;base64,${screenshot.image_base64}`}
                      alt={`Screenshot from ${screenshot.monitor_name}`}
                      className="w-full h-auto"
                      style={{ maxHeight: '400px', objectFit: 'contain' }}
                    />
                  </div>

                  <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
                    Image size: {Math.round(screenshot.image_base64.length / 1024)} KB
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!isCapturing && screenshots.length === 0 && !error && (
        <div className="mt-8 text-center text-zinc-500 dark:text-zinc-400">
          <Text>Click the button above to capture screenshots from all monitors</Text>
        </div>
      )}
    </div>
  );
}
