import { Component, ErrorInfo, ReactNode } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryBase extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <p className="text-red-500 font-semibold">{t('errors.somethingWentWrong')}</p>
          <p className="text-sm text-gray-500">{this.state.error?.message}</p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('errors.tryAgain')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation('common')(ErrorBoundaryBase);
