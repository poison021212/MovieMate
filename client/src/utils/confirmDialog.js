import { Modal } from 'antd'

/**
 * 危险操作二次确认；用户点取消会 reject。
 */
export function confirmDanger({ title, content, okText = '确定', cancelText = '取消' }) {
  return new Promise((resolve, reject) => {
    Modal.confirm({
      title,
      content,
      okText,
      cancelText,
      okButtonProps: { danger: true },
      onOk: () => resolve(),
      onCancel: () => reject(new Error('cancelled')),
    })
  })
}
