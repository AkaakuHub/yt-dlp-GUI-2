import React from 'react'
import Button from '../../ui/button'

type Props = React.ComponentProps<typeof Button>

export default function CustomButton(props: Props) {
  return <Button {...props} />
}

