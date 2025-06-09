export interface FunctionCardProps {
  disabled?: boolean;
}

export interface FunctionItem {
  name: string;
  description: string;
  action?: () => void;
  uploadAction?: () => void;
  runAction?: () => void;
  icon?: React.ElementType;
  uploadIcon?: React.ElementType;
  runIcon?: React.ElementType;
  disabled?: boolean;
} 