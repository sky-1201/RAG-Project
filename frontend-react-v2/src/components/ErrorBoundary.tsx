import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-background p-8">
          <div className="max-w-md text-center">
            <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-danger-light">
              <AlertTriangle className="h-7 w-7 text-danger" />
            </div>
            <h1 className="mb-2 text-base font-semibold">页面出现异常</h1>
            <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
              组件渲染时发生错误，请尝试刷新页面。
              <br />
              如果问题持续出现，请联系开发者。
            </p>
            {this.state.error && (
              <pre className="mb-5 max-h-28 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground font-mono">
                {this.state.error.message}
              </pre>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新页面
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
