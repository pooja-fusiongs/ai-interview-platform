import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navigation from '../layout/Sidebar'
import JobCreationForm from './JobCreationForm'
import { Job } from '../../types'

const JobCreation: React.FC = () => {
  const [openDialog, setOpenDialog] = useState<boolean>(true)
  const navigate = useNavigate()

  const handleClose = (): void => {
    setOpenDialog(false)
    navigate('/jobs') // Navigate back to jobs page
  }

  const handleJobCreate = (job: Job): void => {
    console.log('Job created:', job)
    // You can add logic here to save the job to your backend
    navigate('/jobs') // Navigate back to jobs page after creation
  }

  return (
    <Navigation>
      <JobCreationForm 
        open={openDialog}
        onClose={handleClose}
        onJobCreate={handleJobCreate}
      />
    </Navigation>
  )
}

export default JobCreation