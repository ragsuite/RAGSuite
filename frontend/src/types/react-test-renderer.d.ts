declare module 'react-test-renderer' {
  import type { ComponentType, ReactElement } from 'react';

  export interface ReactTestInstance {
    type: string | ComponentType<unknown>;
    props: any;
    parent: ReactTestInstance | null;
    children: Array<ReactTestInstance | string>;
    findByType(type: string | ComponentType<any>): ReactTestInstance;
    findAllByType(type: string | ComponentType<any>): ReactTestInstance[];
    findByProps(props: Record<string, unknown>): ReactTestInstance;
    findAllByProps(props: Record<string, unknown>): ReactTestInstance[];
  }

  export interface ReactTestRenderer {
    toJSON(): unknown;
    unmount(): void;
    update(nextElement: ReactElement): void;
    root: ReactTestInstance;
  }

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void> | void;

  const renderer: {
    create: typeof create;
    act: typeof act;
  };

  namespace renderer {
    type ReactTestRenderer = import('react-test-renderer').ReactTestRenderer;
    type ReactTestInstance = import('react-test-renderer').ReactTestInstance;
  }

  export default renderer;
}
