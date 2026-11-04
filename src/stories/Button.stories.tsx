import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Button',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Destructive',
  },
};
export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
};
export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large',
  },
};
export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small',
  },
};
