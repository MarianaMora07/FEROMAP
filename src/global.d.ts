// Global type declarations for SolidJS JSX compatibility
// Allows using className as alias for class in JSX (SolidJS uses class, but React ecosystem uses className)

import 'solid-js';

declare module 'solid-js' {
  namespace JSX {
    interface HTMLAttributes<T> {
      className?: string;
    }
    
    interface SVGAttributes<T> {
      className?: string;
    }
    
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

// Allow className on all intrinsic elements
declare namespace JSX {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    className?: string;
  }
  
  interface SVGAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    className?: string;
  }
  
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}